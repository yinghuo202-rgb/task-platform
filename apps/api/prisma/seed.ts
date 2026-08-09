import "dotenv/config";
import * as argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

if (process.env.APP_ENV === "production") {
  throw new Error("安全保护：生产环境禁止运行开发 seed，请使用 pnpm admin:create 初始化管理员。");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main(): Promise<void> {
  const userPassword = process.env.SEED_USER_PASSWORD ?? "ChangeMe123!";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const [admin, publisher, assignee] = await Promise.all([
    prisma.user.upsert({
      where: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.test" },
      update: {},
      create: {
        username: "admin",
        email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.test",
        displayName: "平台管理员",
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
        role: "ADMIN",
      },
    }),
    prisma.user.upsert({
      where: { email: "publisher@example.test" },
      update: {},
      create: {
        username: "publisher",
        email: "publisher@example.test",
        displayName: "示例发布者",
        passwordHash: await argon2.hash(userPassword, { type: argon2.argon2id }),
      },
    }),
    prisma.user.upsert({
      where: { email: "worker@example.test" },
      update: {},
      create: {
        username: "worker",
        email: "worker@example.test",
        displayName: "示例接取者",
        passwordHash: await argon2.hash(userPassword, { type: argon2.argon2id }),
      },
    }),
  ]);

  const project = await prisma.project.upsert({
    where: { id: "f8aa84dd-1e32-4c62-a43a-8cc8db508101" },
    update: { name: "la vie", description: "两个人的私人生活空间，记录日子、安排时间和一起完成的事情。", kind: "COMPANION" },
    create: {
      id: "f8aa84dd-1e32-4c62-a43a-8cc8db508101",
      creatorId: publisher.id,
      name: "la vie",
      description: "两个人的私人生活空间，记录日子、安排时间和一起完成的事情。",
      kind: "COMPANION",
      members: {
        create: [
          { userId: publisher.id, role: "OWNER" },
          { userId: assignee.id, role: "MEMBER" },
          { userId: admin.id, role: "MANAGER" },
        ],
      },
    },
  });
  await Promise.all([
    prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: publisher.id } }, update: { role: "OWNER" }, create: { projectId: project.id, userId: publisher.id, role: "OWNER" } }),
    prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: assignee.id } }, update: { role: "MEMBER" }, create: { projectId: project.id, userId: assignee.id, role: "MEMBER" } }),
    prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: admin.id } }, update: { role: "MANAGER" }, create: { projectId: project.id, userId: admin.id, role: "MANAGER" } }),
  ]);

  const existing = await prisma.task.findFirst({ where: { projectId: project.id, title: "整理产品资料并建立归档清单" } });
  if (!existing) {
    await prisma.task.create({
      data: {
        projectId: project.id,
        publisherId: publisher.id,
        title: "整理产品资料并建立归档清单",
        summary: "将项目资料按模块和版本分类，并输出一份清晰的归档清单。",
        description: "资料通过任务附件提供。请保持原文件不变，输出分类建议、文件命名规则和完整清单。",
        category: "资料整理",
        status: "PUBLISHED",
        visibility: "PRIVATE",
        claimMode: "AUTO",
        maxAssignees: 1,
        rewardType: "SERVICE",
        rewardDescription: "完成后互相提供一次资料整理协助",
        locationType: "REMOTE",
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        publishedAt: new Date(),
        requirements: {
          create: [
            { title: "归档清单", description: "提交 XLSX 或 CSV 格式的完整清单", required: true, sortOrder: 0 },
            { title: "命名规则", description: "写明文件命名和目录分层建议", required: true, sortOrder: 1 },
          ],
        },
      },
    });
  }
  const journalSeed = [
    { title: "傍晚绕着湖走了一圈", date: "2026-08-08", content: "风比前几天凉一点。\n\n路边那家面包店换了新的招牌，我们约好下次去试试。", type: "JOURNAL" as const },
    { title: "《花束般的恋爱》", date: "2026-08-05", content: "不是轰轰烈烈的故事，反而更像生活本来的样子。看完以后聊了很久。", type: "REVIEW" as const },
  ];
  for (const item of journalSeed) {
    const exists = await prisma.entry.findFirst({ where: { title: item.title, entryDate: new Date(`${item.date}T00:00:00.000Z`) } });
    if (exists) continue;
    const entry = await prisma.entry.create({ data: { projectId: project.id, type: item.type, title: item.title, contentMarkdown: item.content, entryDate: new Date(`${item.date}T00:00:00.000Z`), rating: item.type === "REVIEW" ? 4.5 : null, category: item.type === "REVIEW" ? "电影" : "日常", tags: item.type === "REVIEW" ? ["电影", "周末"] : ["散步", "日常"], visibility: "PUBLIC", createdById: publisher.id, updatedById: publisher.id } });
    await prisma.entryVersion.create({ data: { entryId: entry.id, version: 1, title: entry.title, contentMarkdown: entry.contentMarkdown, createdById: publisher.id } });
  }
  console.info(`Seed complete: admin=${admin.email}, publisher=${publisher.email}, worker=${assignee.email}`);
}

void main().finally(() => prisma.$disconnect());
