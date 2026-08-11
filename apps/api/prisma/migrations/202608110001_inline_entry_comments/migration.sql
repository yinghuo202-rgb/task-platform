ALTER TABLE "entry_comments"
ADD COLUMN "anchorBlock" INTEGER,
ADD COLUMN "anchorQuote" VARCHAR(500);

ALTER TABLE "entry_comments"
ADD CONSTRAINT "entry_comments_anchorBlock_check"
CHECK ("anchorBlock" IS NULL OR "anchorBlock" >= 0);
