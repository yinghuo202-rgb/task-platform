import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import * as argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

async function main(): Promise<void> {
  const prompt = createInterface({ input: stdin, output: stdout });
  const email = (process.env.ADMIN_EMAIL ?? await prompt.question("管理员邮箱: ")).trim().toLowerCase();
  const username = (process.env.ADMIN_USERNAME ?? await prompt.question("管理员用户名: ")).trim();
  const displayName = (process.env.ADMIN_DISPLAY_NAME ?? await prompt.question("显示名称: ")).trim();
  const password = process.env.ADMIN_PASSWORD ?? await prompt.question("管理员密码（至少 12 位）: ");
  prompt.close();
  if (password.length < 12) throw new Error("管理员密码至少 12 位");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const admin = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, username, displayName, passwordHash, role: "ADMIN" },
        select: { id: true, email: true, username: true },
      });
      const existingSpace = await tx.project.findFirst({
        where: { archivedAt: null, kind: "COMPANION" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const space = existingSpace ?? await tx.project.create({
        data: {
          creatorId: created.id,
          name: "la vie",
          description: "两个人的私密生活空间",
          color: "#8fb8ab",
          kind: "COMPANION",
        },
        select: { id: true },
      });
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: space.id, userId: created.id } },
        update: { role: "OWNER" },
        create: { projectId: space.id, userId: created.id, role: "OWNER" },
      });
      return created;
    });
    console.info(`管理员和 la vie 空间已创建: ${admin.email} (${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
