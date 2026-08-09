-- Refresh the original demo items so existing installations use private-space language.
UPDATE "tasks"
SET
  "title" = CASE "id"
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26101' THEN '一起玩三角洲行动'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26102' THEN '一起打几局王者'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26103' THEN '一起看一部电影'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26105' THEN '一起运动打卡七天'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26108' THEN '下班后一起散步'
    ELSE "title"
  END,
  "category" = CASE "id"
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26101' THEN '一起做'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26102' THEN '一起做'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26103' THEN '约会'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26104' THEN '记录'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26105' THEN '健康'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26106' THEN '一起做'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26107' THEN '约会'
    WHEN 'c8bc5f09-30e3-4282-8efe-94f39fa26108' THEN '健康'
    ELSE "category"
  END,
  "description" = "summary",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  'c8bc5f09-30e3-4282-8efe-94f39fa26101',
  'c8bc5f09-30e3-4282-8efe-94f39fa26102',
  'c8bc5f09-30e3-4282-8efe-94f39fa26103',
  'c8bc5f09-30e3-4282-8efe-94f39fa26104',
  'c8bc5f09-30e3-4282-8efe-94f39fa26105',
  'c8bc5f09-30e3-4282-8efe-94f39fa26106',
  'c8bc5f09-30e3-4282-8efe-94f39fa26107',
  'c8bc5f09-30e3-4282-8efe-94f39fa26108'
);

UPDATE "tasks" AS task
SET "category" = '其他', "updatedAt" = CURRENT_TIMESTAMP
FROM "projects" AS project
WHERE task."projectId" = project."id"
  AND project."archivedAt" IS NULL
  AND project."kind" = 'COMPANION'
  AND task."category" NOT IN ('一起做', '家务', '采购', '约会', '健康', '记录', '其他');
