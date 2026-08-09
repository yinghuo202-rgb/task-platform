-- The ecommerce dashboard is a separate application. Keep any historical
-- project data recoverable by archiving it before narrowing the 接力 layouts.
UPDATE "projects"
SET "archivedAt" = COALESCE("archivedAt", CURRENT_TIMESTAMP)
WHERE "kind" = 'ECOMMERCE';

ALTER TABLE "projects" ALTER COLUMN "kind" DROP DEFAULT;

CREATE TYPE "ProjectKind_next" AS ENUM ('GENERAL', 'COMPANION');

ALTER TABLE "projects"
ALTER COLUMN "kind" TYPE "ProjectKind_next"
USING (
  CASE
    WHEN "kind"::text = 'COMPANION' THEN 'COMPANION'
    ELSE 'GENERAL'
  END
)::"ProjectKind_next";

DROP TYPE "ProjectKind";
ALTER TYPE "ProjectKind_next" RENAME TO "ProjectKind";
ALTER TABLE "projects" ALTER COLUMN "kind" SET DEFAULT 'GENERAL';
