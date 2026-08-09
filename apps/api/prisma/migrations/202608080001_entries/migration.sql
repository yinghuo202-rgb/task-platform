CREATE TYPE "EntryType" AS ENUM ('JOURNAL', 'REVIEW');

CREATE TABLE "entries" (
  "id" UUID NOT NULL,
  "type" "EntryType" NOT NULL DEFAULT 'JOURNAL',
  "title" VARCHAR(160) NOT NULL,
  "contentMarkdown" TEXT NOT NULL,
  "entryDate" DATE NOT NULL,
  "rating" DECIMAL(2,1),
  "category" VARCHAR(60),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
  "status" VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
  "createdById" UUID NOT NULL,
  "updatedById" UUID NOT NULL,
  "importedPath" VARCHAR(500),
  "importHash" VARCHAR(128),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entry_versions" (
  "id" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "contentMarkdown" TEXT NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "entries_importedPath_importHash_key"
ON "entries"("importedPath", "importHash");

CREATE INDEX "entries_entryDate_id_idx"
ON "entries"("entryDate", "id");

CREATE INDEX "entries_type_entryDate_idx"
ON "entries"("type", "entryDate");

CREATE INDEX "entries_visibility_entryDate_idx"
ON "entries"("visibility", "entryDate");

CREATE UNIQUE INDEX "entry_versions_entryId_version_key"
ON "entry_versions"("entryId", "version");

CREATE INDEX "entry_versions_entryId_createdAt_idx"
ON "entry_versions"("entryId", "createdAt");

ALTER TABLE "entries"
ADD CONSTRAINT "entries_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entries"
ADD CONSTRAINT "entries_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "entry_versions"
ADD CONSTRAINT "entry_versions_entryId_fkey"
FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entry_versions"
ADD CONSTRAINT "entry_versions_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
