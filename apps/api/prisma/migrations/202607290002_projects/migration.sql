-- Project-scoped collaboration and permissions
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'MANAGER', 'MEMBER', 'VIEWER');

CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(2000),
    "color" VARCHAR(20) NOT NULL DEFAULT '#3157f6',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tasks" ADD COLUMN "projectId" UUID;

-- Preserve installations that already contain tasks by creating one private
-- workspace for each publisher and making that publisher its owner.
INSERT INTO "projects" ("id", "creatorId", "name", "description", "updatedAt")
SELECT gen_random_uuid(), "publisherId", '迁移的任务', '由升级程序为既有任务创建的内部项目', CURRENT_TIMESTAMP
FROM "tasks"
GROUP BY "publisherId";

INSERT INTO "project_members" ("id", "projectId", "userId", "role", "updatedAt")
SELECT gen_random_uuid(), p."id", p."creatorId", 'OWNER', CURRENT_TIMESTAMP
FROM "projects" p
WHERE p."description" = '由升级程序为既有任务创建的内部项目';

UPDATE "tasks" t
SET "projectId" = p."id"
FROM "projects" p
WHERE p."creatorId" = t."publisherId"
  AND p."description" = '由升级程序为既有任务创建的内部项目';

ALTER TABLE "tasks" ALTER COLUMN "projectId" SET NOT NULL;

CREATE INDEX "projects_creatorId_idx" ON "projects"("creatorId");
CREATE INDEX "projects_archivedAt_idx" ON "projects"("archivedAt");
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");
CREATE INDEX "tasks_projectId_idx" ON "tasks"("projectId");

ALTER TABLE "projects" ADD CONSTRAINT "projects_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
