CREATE TABLE "entry_comments" (
  "id" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "content" VARCHAR(1200) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "deletedAt" TIMESTAMPTZ(3),
  CONSTRAINT "entry_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "entry_comments_entryId_createdAt_idx"
ON "entry_comments"("entryId", "createdAt");

CREATE INDEX "entry_comments_authorId_idx"
ON "entry_comments"("authorId");

ALTER TABLE "entry_comments"
ADD CONSTRAINT "entry_comments_entryId_fkey"
FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entry_comments"
ADD CONSTRAINT "entry_comments_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
