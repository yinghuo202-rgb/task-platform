type TaskTiming = {
  timeMode: "BEFORE" | "WITHIN" | "AT";
  durationValue: number | null;
  durationUnit: "MINUTES" | "HOURS" | "DAYS" | null;
  deadline: string | null;
  personalDueAt: string | null;
};

const unitLabels = { MINUTES: "分钟", HOURS: "小时", DAYS: "天" } as const;

export function taskTimeLabel(task: TaskTiming) {
  if (task.timeMode === "WITHIN") {
    return task.durationValue && task.durationUnit
      ? `开始后 ${task.durationValue} ${unitLabels[task.durationUnit]}内`
      : "开始后再定";
  }
  if (!task.deadline) return "时间待定";
  const time = formatAbsolute(task.deadline);
  return task.timeMode === "BEFORE" ? `${time} 前` : time;
}

export function personalTaskTimeLabel(task: TaskTiming, completed = false) {
  if (!task.personalDueAt) return taskTimeLabel(task);
  const dueAt = new Date(task.personalDueAt);
  const now = new Date();
  if (!completed && dueAt.getTime() < now.getTime()) return "已逾期";
  const relative = formatRelative(dueAt, now);
  return task.timeMode === "AT" ? relative : `${relative} 前`;
}

export function taskTimeIsOverdue(task: TaskTiming, completed = false) {
  return Boolean(!completed && task.personalDueAt && new Date(task.personalDueAt).getTime() < Date.now());
}

function formatAbsolute(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelative(date: Date, now: Date) {
  const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `明天 ${time}`;
  return formatAbsolute(date.toISOString());
}
