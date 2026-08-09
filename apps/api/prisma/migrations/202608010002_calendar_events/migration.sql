CREATE TABLE "calendar_events" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" VARCHAR(1000),
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "color" VARCHAR(20) NOT NULL DEFAULT '#7f66ff',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_events_userId_startsAt_idx" ON "calendar_events"("userId", "startsAt");
CREATE INDEX "calendar_events_userId_endsAt_idx" ON "calendar_events"("userId", "endsAt");

ALTER TABLE "calendar_events"
ADD CONSTRAINT "calendar_events_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
