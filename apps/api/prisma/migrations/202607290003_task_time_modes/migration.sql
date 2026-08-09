-- Add flexible task time definitions and freeze each assignee's calculated due time.
CREATE TYPE "TaskTimeMode" AS ENUM ('BEFORE', 'WITHIN', 'AT');
CREATE TYPE "TaskTimeUnit" AS ENUM ('MINUTES', 'HOURS', 'DAYS');

ALTER TABLE "tasks"
  ADD COLUMN "timeMode" "TaskTimeMode" NOT NULL DEFAULT 'BEFORE',
  ADD COLUMN "durationValue" INTEGER,
  ADD COLUMN "durationUnit" "TaskTimeUnit";

ALTER TABLE "task_assignments"
  ADD COLUMN "dueAt" TIMESTAMPTZ(3);

UPDATE "task_assignments" AS assignment
SET "dueAt" = task."deadline"
FROM "tasks" AS task
WHERE task.id = assignment."taskId"
  AND task."deadline" IS NOT NULL;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_duration_value_check"
  CHECK ("durationValue" IS NULL OR "durationValue" > 0);

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_time_definition_check"
  CHECK (
    ("timeMode" = 'WITHIN' AND "durationValue" IS NOT NULL AND "durationUnit" IS NOT NULL AND "deadline" IS NULL)
    OR
    ("timeMode" IN ('BEFORE', 'AT') AND "durationValue" IS NULL AND "durationUnit" IS NULL)
  );
