CREATE TYPE "CalendarSubscriptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "calendar_subscriptions" (
  "id" UUID NOT NULL,
  "subscriberId" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "status" "CalendarSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "respondedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "calendar_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_subscriptions_subscriberId_ownerId_key"
ON "calendar_subscriptions"("subscriberId", "ownerId");

CREATE INDEX "calendar_subscriptions_ownerId_status_idx"
ON "calendar_subscriptions"("ownerId", "status");

CREATE INDEX "calendar_subscriptions_subscriberId_status_idx"
ON "calendar_subscriptions"("subscriberId", "status");

ALTER TABLE "calendar_subscriptions"
ADD CONSTRAINT "calendar_subscriptions_subscriberId_fkey"
FOREIGN KEY ("subscriberId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calendar_subscriptions"
ADD CONSTRAINT "calendar_subscriptions_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
