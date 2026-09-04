CREATE TABLE "calendar_todos" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "note" VARCHAR(1000),
    "dueAt" TIMESTAMPTZ(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMPTZ(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_todos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_todos_userId_completedAt_dueAt_idx"
ON "calendar_todos"("userId", "completedAt", "dueAt");

CREATE INDEX "calendar_todos_userId_position_idx"
ON "calendar_todos"("userId", "position");

ALTER TABLE "calendar_todos"
ADD CONSTRAINT "calendar_todos_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
