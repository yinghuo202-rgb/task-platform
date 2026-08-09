ALTER TABLE "entries" ADD COLUMN "projectId" UUID;

UPDATE "entries"
SET "projectId" = (
  SELECT "id" FROM "projects"
  WHERE "archivedAt" IS NULL AND "kind" = 'COMPANION'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "projectId" IS NULL;

ALTER TABLE "entries" ALTER COLUMN "projectId" SET NOT NULL;

CREATE INDEX "entries_projectId_entryDate_idx"
ON "entries"("projectId", "entryDate");

ALTER TABLE "entries"
ADD CONSTRAINT "entries_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
