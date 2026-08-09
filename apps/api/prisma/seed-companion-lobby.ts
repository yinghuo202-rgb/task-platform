import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, options: "-c timezone=UTC" }),
});

const projectId = "f8aa84dd-1e32-4c62-a43a-8cc8db508101";
const presets = [
  {
    id: "c8bc5f09-30e3-4282-8efe-94f39fa26101",
    title: "一起玩三角洲行动",
    summary: "一起跑刀、做任务或熟悉地图，主打轻松沟通和快乐开黑。",
    description: "先确认平台、游戏模式和大致时段。不追求高强度上分，轻松玩就好。",
    category: "一起做",
    durationValue: 3,
    durationUnit: "HOURS" as const,
    locationType: "REMOTE" as const,
    locationDescription: "线上语音与游戏内组队",
    requirement: "完成约定时长，并在任务中简单记录本次游戏内容。",
  },
  {
    id: "c8bc5f09-30e3-4282-8efe-94f39fa26102",
    title: "一起打几局王者",
    summary: "来一局不压力的王者排位，愿意沟通、不甩锅，输赢都开心。",
    description: "提前确认段位、常用位置和游戏时间，输赢都不甩锅。",
    category: "一起做",
    durationValue: 2,
    durationUnit: "HOURS" as const,
    locationType: "REMOTE" as const,
    locationDescription: "线上语音与游戏内组队",
    requirement: "共同完成约定场次，并保持友好沟通。",
  },
  {
    id: "c8bc5f09-30e3-4282-8efe-94f39fa26103",
    title: "一起看一部电影",
    summary: "选一部都感兴趣的电影同步观看，看完交换一点真实感受。",
    description: "一起选片并确认开始时间，可以安静看，也可以轻松聊天。",
    category: "约会",
    durationValue: 2,
    durationUnit: "DAYS" as const,
    locationType: "REMOTE" as const,
    locationDescription: "线上同步观看",
    requirement: "完成一次同步观影，并留下简短观后感。",
  },
  {
    id: "c8bc5f09-30e3-4282-8efe-94f39fa26104",
    title: "安静共读一小时",
    summary: "各自读自己的书，开着语音安静陪伴，结束后分享一句收获。",
    description: "确认共读时段，过程中保持安静，结束后各自分享一段喜欢的内容。",
    category: "记录",
    durationValue: 1,
    durationUnit: "DAYS" as const,
    locationType: "REMOTE" as const,
    locationDescription: "线上语音共读",
    requirement: "共同专注阅读至少一小时，并完成一次简短分享。",
  },
  {
    id: "c8bc5f09-30e3-4282-8efe-94f39fa26105",
    title: "一起运动打卡七天",
    summary: "互相提醒、分享运动记录，用七天养成一个轻松的小习惯。",
    description: "运动内容与强度由双方根据自身情况决定，可选择散步、跑步、健身或拉伸。只做陪伴和提醒，不提供专业医疗或训练建议。",
    category: "健康",
    durationValue: 7,
    durationUnit: "DAYS" as const,
    locationType: "REMOTE" as const,
    locationDescription: "线上打卡",
    requirement: "七天内至少完成三次运动打卡，并互相给予反馈。",
  },
  {
    id: "c8bc5f09-30e3-4282-8efe-94f39fa26106",
    title: "一起听歌交换歌单",
    summary: "分享最近循环的歌，交换一份带着个人心情的小歌单。",
    description: "说说最近喜欢的音乐类型，各自整理一份歌单并写一句推荐理由。",
    category: "一起做",
    durationValue: 2,
    durationUnit: "DAYS" as const,
    locationType: "REMOTE" as const,
    locationDescription: "线上歌单分享",
    requirement: "双方各分享一份歌单，并完成一次听后交流。",
  },
  {
    id: "c8bc5f09-30e3-4282-8efe-94f39fa26107",
    title: "周末线上桌游局",
    summary: "凑一场轻松的线上桌游，规则友好，新手也能快乐加入。",
    description: "一起确认游戏和时间，优先选择规则简单的线上桌游。",
    category: "约会",
    durationValue: 3,
    durationUnit: "DAYS" as const,
    locationType: "REMOTE" as const,
    locationDescription: "线上桌游房间",
    requirement: "组织并完成一场线上桌游，结束后记录参与情况。",
  },
  {
    id: "c8bc5f09-30e3-4282-8efe-94f39fa26108",
    title: "下班后一起散步",
    summary: "在安全的公共场所散散步、聊聊天，给忙碌的一天松松绑。",
    description: "确认大致区域和时间，选择明亮、人流正常的公共场所。",
    category: "健康",
    durationValue: 2,
    durationUnit: "DAYS" as const,
    locationType: "ONSITE" as const,
    locationDescription: "同城安全公共场所，具体地点在项目内确认",
    requirement: "在双方确认的公共场所完成一次轻松散步，并注意人身安全。",
  },
];

async function main() {
  const owner = await prisma.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) throw new Error("请先创建一个可用的系统管理员账号");

  await prisma.project.upsert({
    where: { id: projectId },
    update: {
      name: "la vie",
      description: "两个人的私人生活空间，记录日子、安排时间和一起完成的事情。",
      color: "#8fb8ab",
      kind: "COMPANION",
    },
    create: {
      id: projectId,
      creatorId: owner.id,
      name: "la vie",
      description: "两个人的私人生活空间，记录日子、安排时间和一起完成的事情。",
      color: "#8fb8ab",
      kind: "COMPANION",
    },
  });
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: owner.id } },
    update: { role: "OWNER" },
    create: { projectId, userId: owner.id, role: "OWNER" },
  });

  let created = 0;
  for (const preset of presets) {
    if (await prisma.task.findUnique({ where: { id: preset.id } })) continue;
    await prisma.task.create({
      data: {
        id: preset.id,
        projectId,
        publisherId: owner.id,
        title: preset.title,
        summary: preset.summary,
        description: preset.description,
        category: preset.category,
        status: "PUBLISHED",
        visibility: "PRIVATE",
        claimMode: "AUTO",
        maxAssignees: 1,
        rewardType: "OTHER",
        rewardDescription: "按店内约定记录一次陪伴服务",
        locationType: preset.locationType,
        locationDescription: preset.locationDescription,
        timeMode: "WITHIN",
        durationValue: preset.durationValue,
        durationUnit: preset.durationUnit,
        publishedAt: new Date(),
        requirements: {
          create: [{ title: "完成标准", description: preset.requirement, required: true, sortOrder: 0 }],
        },
      },
    });
    created += 1;
  }

  console.info(`la vie 已就绪：项目=${projectId}，新增预设任务=${created}`);
}

void main().finally(() => prisma.$disconnect());
