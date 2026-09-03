export type ApiResponse<T> = {
  data: T;
  meta?: Record<string, unknown>;
  requestId: string;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const taskStatuses = [
  "DRAFT", "PUBLISHED", "CLAIMED", "IN_PROGRESS", "SUBMITTED",
  "REVISION_REQUESTED", "COMPLETED", "CANCELLED", "DISPUTED", "REMOVED",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarPath: string | null;
  bio?: string | null;
};

export type ProjectRole = "OWNER" | "MANAGER" | "MEMBER" | "VIEWER";
export type ProjectKind = "GENERAL" | "COMPANION";

export type CalendarEvent = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type CalendarFeedEvent = CalendarEvent & {
  owner: PublicUser;
  editable: boolean;
};

export type CalendarSubscriptionStatus = "PENDING" | "APPROVED" | "REJECTED";

export type CalendarSubscription = {
  id: string;
  subscriberId: string;
  ownerId: string;
  status: CalendarSubscriptionStatus;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subscriber?: PublicUser;
  owner?: PublicUser;
};

export type CalendarSubscriptionOverview = {
  candidates: Array<PublicUser & {
    sharedProjects: Array<{ id: string; name: string; color: string }>;
    subscription: CalendarSubscription | null;
  }>;
  outgoing: CalendarSubscription[];
  incoming: CalendarSubscription[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  kind: ProjectKind;
  currentRole: ProjectRole;
  members: Array<{
    id: string;
    userId: string;
    role: ProjectRole;
    user: PublicUser;
  }>;
  _count: { tasks: number; members: number };
  createdAt: string;
  updatedAt: string;
};

export type TaskSummary = {
  id: string;
  projectId: string;
  project: { id: string; name: string; color: string };
  title: string;
  summary: string;
  category: string;
  status: TaskStatus;
  visibility: "PUBLIC" | "PRIVATE";
  claimMode: "AUTO" | "APPROVAL";
  rewardType: "POINTS" | "CASH_OFFLINE" | "ITEM" | "SERVICE" | "OTHER";
  rewardAmount: string | null;
  rewardDescription: string | null;
  rewardOptions: string[];
  locationType: "REMOTE" | "ONSITE" | "HYBRID" | "UNSPECIFIED";
  locationDescription: string | null;
  timeMode: "BEFORE" | "WITHIN" | "AT";
  durationValue: number | null;
  durationUnit: "MINUTES" | "HOURS" | "DAYS" | null;
  deadline: string | null;
  personalDueAt: string | null;
  personalAssignedAt: string | null;
  personalCompletedAt: string | null;
  personalAssignmentStatus: "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED" | "CANCELLED" | null;
  publishedAt: string | null;
  completedAt: string | null;
  publisher: PublicUser;
  applicationCount: number;
  assignmentCount: number;
  maxAssignees: number;
};
