CREATE TABLE "shared_wishes" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "sourceKey" VARCHAR(100),
  "createdById" UUID NOT NULL,
  "completedById" UUID,
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shared_wishes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shared_wishes_projectId_sourceKey_key" ON "shared_wishes"("projectId", "sourceKey");
CREATE INDEX "shared_wishes_projectId_completedAt_position_idx" ON "shared_wishes"("projectId", "completedAt", "position");

ALTER TABLE "shared_wishes"
  ADD CONSTRAINT "shared_wishes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shared_wishes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shared_wishes_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

WITH primary_space AS (
  SELECT "id", "creatorId"
  FROM "projects"
  WHERE "archivedAt" IS NULL AND "kind" = 'COMPANION'
  ORDER BY "createdAt" ASC
  LIMIT 1
), presets("position", "title") AS (
  VALUES
    (1, '一起看相片吧 一定比一个人有趣'),
    (2, '要一起喝点小酒 （才不是为了乘人之危。听说甜葡萄酒好喝'),
    (3, '一起做手工（lego之类的 会有纪念感的成品）'),
    (4, '一起运动（游泳也行 但比较想一起学一个我们都不会的新运动 然后成为彼此的搭子）'),
    (5, '一起布置房间（我感觉steam上的也行诶 这样就会磨合出大家都喜欢的生活环境）。还是一起装台式电脑吧（也不错）'),
    (6, '拥抱！！！！！！（这是持续需求）'),
    (7, '一起写手帐（不确定 感觉会有趣）'),
    (8, '一起看沉浸式戏剧'),
    (9, '试试看一起泡澡or泡温泉（冰岛好像有温泉）'),
    (10, '一起赚钱！！！！（中彩票也算）'),
    (11, '拥有情侣装（不限于衣服，配饰、鞋包都可以）'),
    (12, '一起看演唱会！'),
    (13, '买花 养花 送花'),
    (14, '牵手 散步 可以谈天说地 也可以就一直静静地待在一起'),
    (15, '一起去按摩！'),
    (16, '批评与自我批评（非常需要！）'),
    (17, '一起拍大头贴！or拍立得 or把合照什么的打印出来（喜欢实体照片）'),
    (18, '坐在一起玩游戏（合作类的、竞争类的、桌游、galgame）然后输一天'),
    (19, '做饭（不要overcooked（能吃的都行 饭菜or小甜点）'),
    (20, '电影marathon'),
    (21, '阳光 下午 床'),
    (22, '一起读诗'),
    (23, '一起开一个自媒体账号来记录日常（同意！！！）'),
    (24, '一起做坏事'),
    (25, '一起完成一个作品（任何形式'),
    (26, '到处吃好吃的'),
    (27, '一起定每一年的规划'),
    (28, '逛超市'),
    (29, '很早很早起来吃早饭 然后看着天空慢慢亮起来'),
    (30, '一起了解各种新的东西，玩的也好，技术也好'),
    (31, '自驾出远门'),
    (32, '一起学习、读书、讨论新发生的事'),
    (33, '一起去音乐会、演唱会、音乐剧、话剧、甚至漫展'),
    (34, '一起实现别人的愿望'),
    (35, '一起看极光'),
    (36, '一起在重要的日子给别人写信/寄明信片'),
    (37, '一起吃别人的瓜'),
    (38, '一起观察人类社会'),
    (39, '一起什么都不做'),
    (40, '一起坐很久很久的火车去很远很远的地方'),
    (41, '互相抢饭吃'),
    (42, '一起下棋'),
    (43, '一起各干各的'),
    (44, '一起被别人羡慕'),
    (45, '互相教对方一个技能'),
    (46, '一起去电竞酒店qaq'),
    (47, '一起因为买很贵的东西心疼（但是还要买'),
    (48, '互相偷偷收集把柄（那可以算是一起干坏事了）'),
    (49, '一起学会新的语言（有点点难哦）'),
    (50, '想要一起在城市里漫无目的地前进'),
    (51, '一起创造美好的生活吧！'),
    (52, '一起去没有人的地方放声大喊'),
    (53, '想一起去听合唱团现场'),
    (54, '打多娜多娜'),
    (55, '打猎！'),
    (56, '一起看片'),
    (57, '去徒步、爬山、骑车、露营。')
)
INSERT INTO "shared_wishes" (
  "id", "projectId", "title", "position", "sourceKey", "createdById", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), primary_space."id", presets."title", presets."position",
  'together-v1-' || LPAD(presets."position"::text, 3, '0'),
  primary_space."creatorId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM primary_space
CROSS JOIN presets
ON CONFLICT ("projectId", "sourceKey") DO NOTHING;

-- These were first-version demo tasks. Keep any task already in progress or completed,
-- but remove untouched demo cards from the personal publishing column.
UPDATE "tasks"
SET "status" = 'REMOVED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  'c8bc5f09-30e3-4282-8efe-94f39fa26101',
  'c8bc5f09-30e3-4282-8efe-94f39fa26102',
  'c8bc5f09-30e3-4282-8efe-94f39fa26103',
  'c8bc5f09-30e3-4282-8efe-94f39fa26104',
  'c8bc5f09-30e3-4282-8efe-94f39fa26105',
  'c8bc5f09-30e3-4282-8efe-94f39fa26106',
  'c8bc5f09-30e3-4282-8efe-94f39fa26107',
  'c8bc5f09-30e3-4282-8efe-94f39fa26108'
)
AND "status" IN ('DRAFT', 'PUBLISHED');
