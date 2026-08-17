export type NotificationTargetSource = {
  taskId?: string | null;
  targetPath?: string | null;
  title: string;
};

export function notificationTarget(notification: NotificationTargetSource): string {
  if (notification.targetPath?.startsWith("/") && !notification.targetPath.startsWith("//")) return notification.targetPath;
  if (notification.taskId) return `/tasks/${notification.taskId}`;
  if (notification.title.includes("手帐")) return "/journal";
  if (notification.title.includes("日历") || notification.title.includes("订阅")) return "/dashboard?subscriptions=1";
  return "/dashboard";
}
