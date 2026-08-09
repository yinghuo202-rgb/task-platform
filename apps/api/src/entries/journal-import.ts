import { BadRequestException } from "@nestjs/common";

export const JOURNAL_IMPORT_MANIFEST = "journal-import-manifest.json";

export type JournalImportComment = {
  authorUsername: string;
  content: string;
};

export type JournalImportEntry = {
  sourceId: string;
  file: string;
  title: string;
  date: string;
  authorUsername: string;
  category: string | null;
  tags: string[];
  comments: JournalImportComment[];
};

export type JournalImportAsset = {
  file: string;
  storageName: string;
};

export type JournalImportManifest = {
  version: 1;
  entries: JournalImportEntry[];
  assets: JournalImportAsset[];
};

const usernamePattern = /^[a-zA-Z0-9_-]{3,32}$/;
const datePattern = /^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const assetNamePattern = /^[a-f0-9]{64}\.(?:jpe?g|png|webp)$/i;

export function parseJournalImportManifest(raw: string): JournalImportManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new BadRequestException("手帐迁移清单不是有效的 JSON");
  }
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries) || !Array.isArray(value.assets)) {
    throw new BadRequestException("手帐迁移清单格式不正确");
  }
  if (!value.entries.length || value.entries.length > 10_000) throw new BadRequestException("手帐迁移条目数量不正确");

  const sourceIds = new Set<string>();
  const entries = value.entries.map((item, index): JournalImportEntry => {
    if (!isRecord(item)) throw invalidEntry(index);
    const sourceId = requiredString(item.sourceId, 450, index);
    if (sourceIds.has(sourceId)) throw new BadRequestException(`手帐迁移清单存在重复来源：${sourceId}`);
    sourceIds.add(sourceId);
    const file = safeRelativePath(item.file, `第 ${index + 1} 篇手帐文件`);
    const title = requiredString(item.title, 160, index);
    const date = requiredString(item.date, 10, index);
    const authorUsername = requiredString(item.authorUsername, 32, index);
    if (!datePattern.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw invalidEntry(index, "日期不正确");
    if (!usernamePattern.test(authorUsername)) throw invalidEntry(index, "作者用户名不正确");
    const category = item.category == null ? null : requiredString(item.category, 60, index);
    if (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 50)) {
      throw invalidEntry(index, "标签不正确");
    }
    if (!Array.isArray(item.comments)) throw invalidEntry(index, "评论不正确");
    const comments = item.comments.map((comment, commentIndex): JournalImportComment => {
      if (!isRecord(comment)) throw invalidEntry(index, `第 ${commentIndex + 1} 条评论不正确`);
      const commentAuthor = requiredString(comment.authorUsername, 32, index);
      const content = requiredString(comment.content, 1_200, index);
      if (!usernamePattern.test(commentAuthor)) throw invalidEntry(index, `第 ${commentIndex + 1} 条评论作者不正确`);
      return { authorUsername: commentAuthor, content };
    });
    return { sourceId, file, title, date, authorUsername, category, tags: item.tags.map((tag) => tag.trim()), comments };
  });

  const assetNames = new Set<string>();
  const assets = value.assets.map((item, index): JournalImportAsset => {
    if (!isRecord(item)) throw new BadRequestException(`第 ${index + 1} 张手帐图片不正确`);
    const file = safeRelativePath(item.file, `第 ${index + 1} 张手帐图片`);
    const storageName = typeof item.storageName === "string" ? item.storageName : "";
    if (!assetNamePattern.test(storageName)) throw new BadRequestException(`第 ${index + 1} 张手帐图片名称不正确`);
    if (assetNames.has(storageName)) throw new BadRequestException(`手帐迁移清单存在重复图片：${storageName}`);
    assetNames.add(storageName);
    return { file, storageName };
  });
  return { version: 1, entries, assets };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, maxLength: number, entryIndex: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw invalidEntry(entryIndex);
  return value.trim();
}

function safeRelativePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) {
    throw new BadRequestException(`${label}路径不正确`);
  }
  return value;
}

function invalidEntry(index: number, detail = "格式不正确") {
  return new BadRequestException(`第 ${index + 1} 篇手帐${detail}`);
}
