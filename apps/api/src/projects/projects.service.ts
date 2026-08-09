import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth-context";
import type { ProjectRole } from "../generated/prisma/enums";
import { Prisma } from "../generated/prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AddProjectMemberDto,
  CreateProjectDto,
  UpdateProjectDto,
} from "./dto";

const projectInclude = {
  members: {
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarPath: true } },
    },
    orderBy: { joinedAt: "asc" as const },
  },
  _count: { select: { tasks: true, members: true } },
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const projects = await this.prisma.project.findMany({
      where: {
        archivedAt: null,
        kind: "COMPANION",
        ...(user.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } }),
      },
      include: projectInclude,
      orderBy: { updatedAt: "desc" },
    });
    return projects.map((project) => this.withCurrentRole(project, user));
  }

  async get(id: string, user: AuthUser) {
    await this.assertMember(id, user);
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
    if (!project || project.archivedAt) throw new NotFoundException("项目不存在");
    return this.withCurrentRole(project, user);
  }

  async create(user: AuthUser, dto: CreateProjectDto) {
    const existing = await this.prisma.project.findFirst({ where: { archivedAt: null, kind: "COMPANION" }, select: { id: true } });
    if (existing) throw new ConflictException("la vie 空间已经存在");
    const project = await this.prisma.project.create({
      data: {
        creatorId: user.id,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        color: dto.color ?? "#3157f6",
        kind: "COMPANION",
        members: { create: { userId: user.id, role: "OWNER" } },
      },
      include: projectInclude,
    });
    await this.audit.record({ actorId: user.id, action: "PROJECT_CREATED", entityType: "Project", entityId: project.id });
    return this.withCurrentRole(project, user);
  }

  async update(id: string, user: AuthUser, dto: UpdateProjectDto) {
    await this.assertRole(id, user, ["OWNER", "MANAGER"]);
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.description === undefined ? {} : { description: dto.description.trim() || null }),
        ...(dto.color === undefined ? {} : { color: dto.color }),
        kind: "COMPANION",
      },
      include: projectInclude,
    });
    await this.audit.record({ actorId: user.id, action: "PROJECT_UPDATED", entityType: "Project", entityId: id });
    return this.withCurrentRole(project, user);
  }

  async archive(id: string, user: AuthUser) {
    await this.assertRole(id, user, ["OWNER"]);
    const project = await this.prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit.record({ actorId: user.id, action: "PROJECT_ARCHIVED", entityType: "Project", entityId: id });
    return project;
  }

  async addMember(id: string, user: AuthUser, dto: AddProjectMemberDto) {
    const actorRole = await this.assertRole(id, user, ["OWNER", "MANAGER"]);
    if (dto.role === "OWNER") throw new ForbiddenException("不能直接添加另一位负责人");
    if (actorRole === "MANAGER" && dto.role === "MANAGER") throw new ForbiddenException("项目管理员不能添加其他管理员");
    const target = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.identifier.trim() }, { email: dto.identifier.trim().toLowerCase() }], status: "ACTIVE" },
    });
    if (!target) throw new NotFoundException("未找到该用户");
    try {
      const member = await this.prisma.projectMember.create({
        data: { projectId: id, userId: target.id, role: dto.role },
        include: { user: { select: { id: true, username: true, displayName: true, avatarPath: true } } },
      });
      await this.audit.record({ actorId: user.id, action: "PROJECT_MEMBER_ADDED", entityType: "Project", entityId: id, metadata: { userId: target.id, role: dto.role } });
      return member;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("该用户已在项目中");
      }
      throw error;
    }
  }

  async updateMember(id: string, memberId: string, user: AuthUser, role: ProjectRole) {
    await this.assertRole(id, user, ["OWNER"]);
    if (role === "OWNER") throw new ForbiddenException("请使用负责人转交功能");
    const member = await this.prisma.projectMember.findUnique({ where: { id: memberId } });
    if (!member || member.projectId !== id) throw new NotFoundException("项目成员不存在");
    if (member.role === "OWNER") throw new ForbiddenException("不能修改项目负责人的角色");
    return this.prisma.projectMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: { select: { id: true, username: true, displayName: true, avatarPath: true } } },
    });
  }

  async removeMember(id: string, memberId: string, user: AuthUser): Promise<{ success: true }> {
    const actorRole = await this.assertRole(id, user, ["OWNER", "MANAGER"]);
    const member = await this.prisma.projectMember.findUnique({ where: { id: memberId } });
    if (!member || member.projectId !== id) throw new NotFoundException("项目成员不存在");
    if (member.role === "OWNER") throw new ForbiddenException("不能移除项目负责人");
    if (actorRole === "MANAGER" && member.role === "MANAGER") throw new ForbiddenException("项目管理员不能移除其他管理员");
    await this.prisma.projectMember.delete({ where: { id: memberId } });
    await this.audit.record({ actorId: user.id, action: "PROJECT_MEMBER_REMOVED", entityType: "Project", entityId: id, metadata: { userId: member.userId } });
    return { success: true };
  }

  async assertMember(projectId: string, user: AuthUser): Promise<ProjectRole> {
    if (user.role === "ADMIN") return "OWNER";
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      include: { project: { select: { archivedAt: true } } },
    });
    if (!membership || membership.project.archivedAt) throw new ForbiddenException("你不是该项目成员");
    return membership.role;
  }

  async assertContributor(projectId: string, user: AuthUser): Promise<ProjectRole> {
    return this.assertRole(projectId, user, ["OWNER", "MANAGER", "MEMBER"]);
  }

  async assertCompanionMember(projectId: string, user: AuthUser): Promise<ProjectRole> {
    const role = await this.assertMember(projectId, user);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, archivedAt: null, kind: "COMPANION" },
      select: { id: true },
    });
    if (!project) throw new ForbiddenException("该内容不属于 la vie 空间");
    return role;
  }

  async assertCompanionContributor(projectId: string, user: AuthUser): Promise<ProjectRole> {
    const role = await this.assertCompanionMember(projectId, user);
    if (!(["OWNER", "MANAGER", "MEMBER"] as ProjectRole[]).includes(role)) {
      throw new ForbiddenException("你在 la vie 中只有查看权限");
    }
    return role;
  }

  async assertRole(projectId: string, user: AuthUser, allowed: ProjectRole[]): Promise<ProjectRole> {
    const role = await this.assertMember(projectId, user);
    if (!allowed.includes(role)) throw new ForbiddenException("你在该项目中没有执行此操作的权限");
    return role;
  }

  private withCurrentRole<T extends { members: Array<{ userId: string; role: ProjectRole }> }>(project: T, user: AuthUser) {
    return { ...project, currentRole: user.role === "ADMIN" ? "OWNER" : project.members.find((member) => member.userId === user.id)?.role };
  }
}
