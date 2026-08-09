-- Persist the project experience explicitly so renaming a project never changes its UI.
CREATE TYPE "ProjectKind" AS ENUM ('GENERAL', 'COMPANION', 'ECOMMERCE');

ALTER TABLE "projects"
ADD COLUMN "kind" "ProjectKind" NOT NULL DEFAULT 'GENERAL';

-- Preserve the two existing seeded experiences during upgrade.
UPDATE "projects"
SET "kind" = 'COMPANION'
WHERE "name" LIKE '%陪玩%';

UPDATE "projects"
SET "kind" = 'ECOMMERCE'
WHERE "name" LIKE '%电商%';
