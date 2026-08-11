import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client";
import type { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { TasksService } from "../src/tasks/tasks.service";
import { CollaborationService } from "../src/collaboration/collaboration.service";
import { ProjectsService } from "../src/projects/projects.service";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

suite("concurrent AUTO claim", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl! }) });
  const prismaService = prisma as unknown as PrismaService;
  const audit = new AuditService(prismaService);
  const projects = new ProjectsService(prismaService, audit);
  const tasks = new TasksService(prismaService, audit, projects);
  const service = new CollaborationService(prismaService, tasks, audit);
  const ids: string[] = [];

  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => {
    if (ids.length) {
      await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] } });
      await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
      await prisma.taskAssignment.deleteMany({ where: { OR: [{ taskId: { in: ids } }, { assigneeId: { in: ids } }] } });
      await prisma.taskRequirement.deleteMany({ where: { taskId: { in: ids } } });
      await prisma.task.deleteMany({ where: { id: { in: ids } } });
      await prisma.projectMember.deleteMany({ where: { OR: [{ projectId: { in: ids } }, { userId: { in: ids } }] } });
      await prisma.project.deleteMany({ where: { id: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  it("allows exactly one claimant for maxAssignees=1", async () => {
    const suffix = Date.now().toString(36);
    const users = await Promise.all(["publisher", "worker-a", "worker-b"].map((name) => prisma.user.create({
      data: { username: `${name}-${suffix}`, email: `${name}-${suffix}@example.test`, displayName: name, passwordHash: "integration-test-only" },
    })));
    ids.push(...users.map((item) => item.id));
    const [publisher, workerA, workerB] = users;
    if (!publisher || !workerA || !workerB) throw new Error("fixture creation failed");
    const project = await prisma.project.create({
      data: {
        creatorId: publisher.id,
        name: "并发测试项目",
        kind: "COMPANION",
        members: {
          create: [
            { userId: publisher.id, role: "OWNER" },
            { userId: workerA.id, role: "MEMBER" },
            { userId: workerB.id, role: "MEMBER" },
          ],
        },
      },
    });
    ids.push(project.id);
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        publisherId: publisher.id, title: "并发接取测试任务", summary: "用于验证只能有一个用户成功接取任务",
        description: "两个用户同时发送接取请求，数据库必须只保留一个有效指派。",
        category: "测试", status: "PUBLISHED", publishedAt: new Date(), visibility: "PUBLIC", claimMode: "AUTO",
        maxAssignees: 1, rewardType: "OTHER", locationType: "REMOTE",
        requirements: { create: [{ title: "测试", description: "完成并发控制验证", required: true, sortOrder: 0 }] },
      },
    });
    ids.push(task.id);
    const settled = await Promise.allSettled([
      service.claim(task.id, { id: workerA.id, sessionId: crypto.randomUUID(), role: "USER" }),
      service.claim(task.id, { id: workerB.id, sessionId: crypto.randomUUID(), role: "USER" }),
    ]);
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(await prisma.taskAssignment.count({ where: { taskId: task.id, status: { not: "CANCELLED" } } })).toBe(1);
  });
});
