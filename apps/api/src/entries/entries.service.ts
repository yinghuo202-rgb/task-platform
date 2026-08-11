import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { AuthUser } from "../common/auth-context";
import type { ProjectRole } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { CreateEntryCommentDto, CreateEntryDto, ListEntriesDto, UpdateEntryDto } from "./dto";
import { JOURNAL_IMPORT_MANIFEST, parseJournalImportManifest, type JournalImportManifest } from "./journal-import";

const publicUser = { id: true, displayName: true, username: true, avatarPath: true } as const;

@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  async list(user: AuthUser, query: ListEntriesDto) {
    const projectId = await this.resolveProjectId(user);
    const from = query.from ? this.dateOnly(query.from) : undefined;
    const to = query.to ? this.dateOnly(query.to) : undefined;
    if (from && to && from >= to) throw new BadRequestException("结束日期必须晚于开始日期");
    const where: Prisma.EntryWhereInput = {
      projectId,
      status: "PUBLISHED",
      ...(user.role !== "ADMIN" ? {
        OR: [{ visibility: "PUBLIC" as const }, { visibility: "PRIVATE" as const, createdById: user.id }],
      } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.date ? { entryDate: this.dateOnly(query.date) } : {}),
      ...(!query.date && (from || to) ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    };
    if (query.view === "index") {
      const [entries, total] = await Promise.all([
        this.prisma.entry.findMany({
          where,
          take: query.limit,
          orderBy: [{ entryDate: "desc" }, { updatedAt: "desc" }],
          select: {
            id: true, type: true, title: true, entryDate: true, rating: true, updatedAt: true,
            createdBy: { select: publicUser },
            _count: { select: { versions: true, comments: { where: { deletedAt: null } } } },
          },
        }),
        this.prisma.entry.count({ where }),
      ]);
      return {
        records: entries,
        total,
        canImport: user.role === "ADMIN",
      };
    }
    return this.prisma.entry.findMany({
      where,
      take: query.limit,
      orderBy: [{ entryDate: "desc" }, { updatedAt: "desc" }],
      include: {
        createdBy: { select: publicUser },
        updatedBy: { select: publicUser },
      },
    });
  }

  async get(user: AuthUser, id: string) {
    const entry = await this.prisma.entry.findUnique({
      where: { id },
      include: {
        createdBy: { select: publicUser },
        updatedBy: { select: publicUser },
        versions: { orderBy: { version: "desc" }, take: 20, select: { id: true, version: true, title: true, createdAt: true, createdBy: { select: publicUser } } },
      },
    });
    if (!entry || entry.status !== "PUBLISHED") throw new NotFoundException("手帐不存在");
    await this.assertProjectMember(entry.projectId, user);
    if (entry.visibility === "PRIVATE" && user.role !== "ADMIN" && entry.createdById !== user.id) {
      // Private entries remain private to the author; shared entries use PUBLIC within this private space.
      throw new NotFoundException("手帐不存在");
    }
    return entry;
  }

  async create(user: AuthUser, dto: CreateEntryDto) {
    const projectId = await this.resolveProjectId(user);
    await this.assertProjectCanWrite(projectId, user);
    const entryDate = this.dateOnly(dto.entryDate);
    const recipients = dto.visibility === "PRIVATE" ? [] : await this.notificationRecipients(projectId, user.id);
    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.entry.create({
        data: {
          projectId,
          type: dto.type,
          title: dto.title.trim(),
          contentMarkdown: dto.contentMarkdown ?? "",
          entryDate,
          rating: dto.rating ?? null,
          category: dto.category?.trim() || null,
          tags: dto.tags ?? [],
          visibility: dto.visibility ?? "PUBLIC",
          createdById: user.id,
          updatedById: user.id,
        },
      });
      await tx.entryVersion.create({
        data: { entryId: created.id, version: 1, title: created.title, contentMarkdown: created.contentMarkdown, createdById: user.id },
      });
      if (recipients.length) {
        await tx.notification.createMany({
          data: recipients.map(({ userId }) => ({ userId, type: "SYSTEM" as const, title: "手帐有新内容", content: created.title })),
        });
      }
      return created;
    });
    return entry;
  }

  async update(user: AuthUser, id: string, dto: UpdateEntryDto) {
    const current = await this.prisma.entry.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("手帐不存在");
    if (current.status !== "PUBLISHED") throw new NotFoundException("手帐不存在");
    await this.assertProjectCanWrite(current.projectId, user);
    if (current.visibility === "PRIVATE" && current.createdById !== user.id && user.role !== "ADMIN") {
      throw new NotFoundException("手帐不存在");
    }
    if (current.version !== dto.version) throw new ConflictException("手帐已被更新，请刷新后重试");
    const nextVersion = current.version + 1;
    const nextVisibility = dto.visibility ?? current.visibility;
    const recipients = nextVisibility === "PRIVATE" ? [] : await this.notificationRecipients(current.projectId, user.id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.entry.update({
        where: { id },
        data: {
          type: dto.type,
          title: dto.title.trim(),
          contentMarkdown: dto.contentMarkdown ?? "",
          entryDate: this.dateOnly(dto.entryDate),
          rating: dto.rating ?? null,
          category: dto.category?.trim() || null,
          tags: dto.tags ?? [],
          visibility: dto.visibility ?? current.visibility,
          updatedById: user.id,
          version: nextVersion,
        },
      });
      await tx.entryVersion.create({
        data: { entryId: id, version: nextVersion, title: updated.title, contentMarkdown: updated.contentMarkdown, createdById: user.id },
      });
      if (recipients.length) {
        await tx.notification.createMany({
          data: recipients.map(({ userId }) => ({ userId, type: "SYSTEM" as const, title: "手帐已更新", content: updated.title })),
        });
      }
      return updated;
    });
  }

  private notificationRecipients(projectId: string, actorId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId, userId: { not: actorId }, user: { status: "ACTIVE" } },
      select: { userId: true },
    });
  }

  async remove(user: AuthUser, id: string): Promise<{ success: true }> {
    const current = await this.prisma.entry.findUnique({ where: { id } });
    if (!current || current.status !== "PUBLISHED") throw new NotFoundException("手帐不存在");
    const role = await this.assertProjectCanWrite(current.projectId, user);
    if (current.createdById !== user.id && !["OWNER", "MANAGER"].includes(role)) {
      throw new ForbiddenException("只能删除自己写下的记录");
    }
    await this.prisma.entry.update({ where: { id }, data: { status: "ARCHIVED", updatedById: user.id } });
    return { success: true };
  }

  async importMarkdown(user: AuthUser) {
    const projectId = await this.resolveProjectId(user);
    const importRoot = this.config.get<string>("JOURNAL_IMPORT_DIR", "/data/journal-import");
    const manifestRaw = await this.readOptionalFile(join(importRoot, JOURNAL_IMPORT_MANIFEST));
    if (manifestRaw !== null) {
      return this.importJournalManifest(projectId, importRoot, parseJournalImportManifest(manifestRaw));
    }
    const files = await this.findMarkdownFiles(importRoot);
    if (!files.length) {
      throw new BadRequestException("导入目录中没有 Markdown 文件，请先解压迁移包并把 entries 目录内容放入导入目录");
    }
    let imported = 0;
    let skipped = 0;
    for (const filePath of files) {
      const raw = await readFile(filePath, "utf8");
      const hash = createHash("sha256").update(raw).digest("hex");
      const relativePath = relative(importRoot, filePath);
      const existing = await this.prisma.entry.findFirst({ where: { importedPath: relativePath, importHash: hash } });
      if (existing) { skipped += 1; continue; }
      const parsed = this.parseMarkdown(raw, await stat(filePath));
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.entry.create({
          data: {
            projectId,
            type: parsed.type,
            title: parsed.title,
            contentMarkdown: parsed.content,
            entryDate: parsed.entryDate,
            rating: parsed.rating,
            category: parsed.category,
            tags: parsed.tags,
            visibility: parsed.visibility,
            createdById: user.id,
            updatedById: user.id,
            importedPath: relativePath,
            importHash: hash,
          },
        });
        await tx.entryVersion.create({ data: { entryId: created.id, version: 1, title: created.title, contentMarkdown: created.contentMarkdown, createdById: user.id } });
      });
      imported += 1;
    }
    return { imported, skipped, source: importRoot };
  }

  async journalAsset(user: AuthUser, storageName: string): Promise<string> {
    await this.resolveProjectId(user);
    return this.storage.journalAssetPath(storageName);
  }

  async listComments(user: AuthUser, entryId: string) {
    await this.assertEntryAccess(entryId, user);
    const comments = await this.prisma.entryComment.findMany({
      where: { entryId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { author: { select: publicUser } },
    });
    return comments.map((comment) => ({ ...comment, canDelete: user.role === "ADMIN" || comment.authorId === user.id }));
  }

  async createComment(user: AuthUser, entryId: string, dto: CreateEntryCommentDto) {
    const entry = await this.assertEntryAccess(entryId, user);
    await this.assertProjectCanWrite(entry.projectId, user);
    if (!dto.content.trim()) throw new BadRequestException("留言不能为空");
    const comment = await this.prisma.entryComment.create({
      data: { entryId, authorId: user.id, content: dto.content.trim() },
      include: { author: { select: publicUser } },
    });
    return { ...comment, canDelete: true };
  }

  async removeComment(user: AuthUser, entryId: string, commentId: string) {
    await this.assertEntryAccess(entryId, user);
    const comment = await this.prisma.entryComment.findFirst({ where: { id: commentId, entryId, deletedAt: null } });
    if (!comment) throw new NotFoundException("留言不存在");
    if (user.role !== "ADMIN" && comment.authorId !== user.id) throw new ForbiddenException("只能删除自己的留言");
    await this.prisma.entryComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  private async assertEntryAccess(entryId: string, user: AuthUser) {
    const entry = await this.prisma.entry.findUnique({
      where: { id: entryId },
      select: { projectId: true, visibility: true, createdById: true, status: true },
    });
    if (!entry || entry.status !== "PUBLISHED") throw new NotFoundException("手帐不存在");
    await this.assertProjectMember(entry.projectId, user);
    if (entry.visibility === "PRIVATE" && user.role !== "ADMIN" && entry.createdById !== user.id) {
      throw new NotFoundException("手帐不存在");
    }
    return entry;
  }

  private async resolveProjectId(user: AuthUser): Promise<string> {
    const project = await this.prisma.project.findFirst({
      where: {
        archivedAt: null,
        kind: "COMPANION",
        ...(user.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } }),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!project) throw new ForbiddenException("你还没有加入 la vie 空间");
    return project.id;
  }

  private async assertProjectMember(projectId: string, user: AuthUser): Promise<void> {
    if (user.role === "ADMIN") return;
    const membership = await this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } });
    if (!membership) throw new NotFoundException("手帐不存在");
  }

  private async assertProjectCanWrite(projectId: string, user: AuthUser): Promise<ProjectRole> {
    if (user.role === "ADMIN") return "OWNER";
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      include: { project: { select: { archivedAt: true, kind: true } } },
    });
    if (!membership || membership.project.archivedAt || membership.project.kind !== "COMPANION") {
      throw new NotFoundException("手帐不存在");
    }
    if (membership.role === "VIEWER") throw new ForbiddenException("你在 la vie 中只有查看权限");
    return membership.role;
  }

  private async findMarkdownFiles(root: string): Promise<string[]> {
    let items;
    try { items = await readdir(root, { withFileTypes: true }); } catch { throw new BadRequestException(`Markdown 目录不存在：${root}`); }
    const files: string[] = [];
    for (const item of items) {
      const itemPath = join(root, item.name);
      if (item.isDirectory()) files.push(...await this.findMarkdownFiles(itemPath));
      else if (item.isFile() && item.name.toLowerCase().endsWith(".md")) files.push(itemPath);
    }
    return files;
  }

  private async importJournalManifest(projectId: string, importRoot: string, manifest: JournalImportManifest) {
    const usernames = [...new Set(manifest.entries.flatMap((entry) => [
      entry.authorUsername,
      ...entry.comments.map((comment) => comment.authorUsername),
    ]))];
    // Older migration packages used the display name (for example `Cristina`)
    // instead of the current login username (`Cristina_zl`). Resolve both
    // forms case-insensitively so those packages remain importable.
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          ...usernames.map((name) => ({ username: { equals: name, mode: "insensitive" as const } })),
          ...usernames.map((name) => ({ displayName: { equals: name, mode: "insensitive" as const } })),
        ],
      },
      select: { id: true, username: true, displayName: true, role: true, status: true },
    });
    const usersByUsername = new Map(users.map((account) => [account.username.trim().toLowerCase(), account]));
    const usersByDisplayName = new Map<string, (typeof users)[number]>();
    for (const account of users) {
      const displayName = account.displayName?.trim().toLowerCase();
      if (displayName && !usersByDisplayName.has(displayName)) usersByDisplayName.set(displayName, account);
    }
    const resolveAuthor = (reference: string) => {
      const normalized = reference.trim().toLowerCase();
      return usersByUsername.get(normalized) ?? usersByDisplayName.get(normalized);
    };
    const missingUsers = usernames.filter((username) => !resolveAuthor(username));
    if (missingUsers.length) throw new BadRequestException(`找不到迁移作者账号：${missingUsers.join("、")}`);
    const referencedUsers = [...new Map(usernames.map((username) => {
      const account = resolveAuthor(username)!;
      return [account.id, account] as const;
    })).values()];
    const inactiveUsers = referencedUsers.filter((account) => account.status !== "ACTIVE");
    if (inactiveUsers.length) throw new BadRequestException(`迁移作者账号已停用：${inactiveUsers.map((account) => account.username).join("、")}`);
    const memberships = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { in: referencedUsers.filter((account) => account.role !== "ADMIN").map((account) => account.id) } },
      select: { userId: true },
    });
    const memberIds = new Set(memberships.map((membership) => membership.userId));
    const usersOutsideProject = referencedUsers.filter((account) => account.role !== "ADMIN" && !memberIds.has(account.id));
    if (usersOutsideProject.length) {
      throw new BadRequestException(`请先把这些账号加入 la vie：${usersOutsideProject.map((account) => account.username).join("、")}`);
    }

    const prepared = await Promise.all(manifest.entries.map(async (entry) => {
      const content = await readFile(this.resolveImportPath(importRoot, entry.file), "utf8");
      const importedPath = `manifest:${entry.sourceId}`;
      const importHash = createHash("sha256").update(JSON.stringify({ ...entry, content })).digest("hex");
      const existing = await this.prisma.entry.findFirst({ where: { importedPath } });
      if (existing && existing.importHash !== importHash) {
        throw new ConflictException(`手帐 ${entry.title} 已导入，但迁移源内容发生了变化`);
      }
      return { entry, content, importedPath, importHash, existing: Boolean(existing) };
    }));

    for (const asset of manifest.assets) {
      await this.storage.importJournalAsset(this.resolveImportPath(importRoot, asset.file), asset.storageName);
    }

    let imported = 0;
    let skipped = 0;
    let comments = 0;
    for (const item of prepared) {
      if (item.existing) { skipped += 1; continue; }
      const author = resolveAuthor(item.entry.authorUsername)!;
      const entryDate = this.dateOnly(item.entry.date);
      const createdAt = new Date(`${item.entry.date}T12:00:00+08:00`);
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.entry.create({
          data: {
            projectId,
            type: "JOURNAL",
            title: item.entry.title,
            contentMarkdown: item.content,
            entryDate,
            category: item.entry.category,
            tags: item.entry.tags,
            visibility: "PUBLIC",
            createdById: author.id,
            updatedById: author.id,
            importedPath: item.importedPath,
            importHash: item.importHash,
            createdAt,
          },
        });
        await tx.entryVersion.create({
          data: { entryId: created.id, version: 1, title: created.title, contentMarkdown: created.contentMarkdown, createdById: author.id, createdAt },
        });
        if (item.entry.comments.length) {
          await tx.entryComment.createMany({
            data: item.entry.comments.map((comment, index) => ({
              entryId: created.id,
              authorId: resolveAuthor(comment.authorUsername)!.id,
              content: comment.content,
              createdAt: new Date(createdAt.getTime() + (index + 1) * 60_000),
            })),
          });
        }
      });
      imported += 1;
      comments += item.entry.comments.length;
    }
    return { imported, skipped, comments, assets: manifest.assets.length, source: importRoot, mode: "structured" };
  }

  private async readOptionalFile(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private resolveImportPath(root: string, relativePath: string): string {
    const resolvedRoot = resolve(root);
    const path = resolve(resolvedRoot, relativePath);
    if (!path.startsWith(`${resolvedRoot}${sep}`)) throw new BadRequestException("手帐迁移文件路径不正确");
    return path;
  }

  private parseMarkdown(raw: string, fileStat: { mtime: Date }) {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    const frontmatter = match?.[1] ?? "";
    const content = match?.[2] ?? raw;
    const readField = (name: string) => frontmatter.match(new RegExp(`^${name}:\\s*(.+)$`, "mi"))?.[1]?.trim().replace(/^['\"]|['\"]$/g, "");
    const title = readField("title") || content.split("\n").find((line) => line.trim().startsWith("#"))?.replace(/^#+\s*/, "").trim() || "未命名手帐";
    const parsedDate = readField("date");
    const entryDate = parsedDate && !Number.isNaN(new Date(parsedDate).getTime()) ? this.dateOnly(parsedDate) : this.dateOnly(fileStat.mtime.toISOString());
    const type = readField("type")?.toLowerCase() === "review" ? "REVIEW" as const : "JOURNAL" as const;
    const ratingValue = Number(readField("rating"));
    const tags = (readField("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
    return { title, content, entryDate, type, rating: Number.isFinite(ratingValue) ? ratingValue : null, category: readField("category") || null, tags, visibility: "PUBLIC" as const };
  }

  private dateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
    if (!match) throw new BadRequestException("手帐日期格式不正确");
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException("手帐日期格式不正确");
    }
    return date;
  }
}
