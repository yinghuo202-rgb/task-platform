-- Keep the oldest active companion project as the single private la vie space.
-- If an older installation has no companion project, promote its oldest active project.
WITH primary_space AS (
  SELECT "id"
  FROM "projects"
  WHERE "archivedAt" IS NULL
  ORDER BY CASE WHEN "kind" = 'COMPANION' THEN 0 ELSE 1 END, "createdAt" ASC
  LIMIT 1
)
UPDATE "projects"
SET
  "name" = 'la vie',
  "kind" = 'COMPANION',
  "description" = '两个人的私密生活空间',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM primary_space);

WITH primary_space AS (
  SELECT "id"
  FROM "projects"
  WHERE "archivedAt" IS NULL AND "kind" = 'COMPANION'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
UPDATE "projects"
SET "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" NOT IN (SELECT "id" FROM primary_space)
  AND "archivedAt" IS NULL;
