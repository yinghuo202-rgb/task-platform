import Link from "next/link";
import type { TaskSummary } from "@task-platform/shared-types";
import { Clock3 } from "lucide-react";
import { taskTimeLabel } from "@/lib/task-time";
import { StatusBadge } from "./ui";

export function TaskCard({ task }: { task: TaskSummary }) {
  return <Link className="card task-card" href={`/tasks/${task.id}`}>
    <div className={`task-card-art ${serviceTone(task.category)}`}><span>{serviceEmoji(task.category)}</span><StatusBadge status={task.status} /><i /><i /></div>
    <div className="task-card-top"><span className="project-pill"><i style={{ background: task.project.color }} />{task.category}</span></div>
    <h3>{task.title}</h3>
    <p>{task.summary}</p>
    <div className="task-footer"><span className="task-publisher"><span className="avatar-placeholder">{task.publisher.displayName.slice(0, 1)}</span><span>{task.publisher.displayName} 写下</span></span><span className="task-deadline"><Clock3 size={14} />{taskTimeLabel(task)}</span></div>
  </Link>;
}

function serviceEmoji(category: string) {
  if (category.includes("家务")) return "🧺";
  if (category.includes("采购")) return "🛍️";
  if (category.includes("约会")) return "🌷";
  if (category.includes("健康")) return "🏃";
  if (category.includes("记录")) return "📖";
  if (category.includes("一起")) return "🫶";
  return "🌈";
}

function serviceTone(category: string) {
  if (category.includes("家务")) return "tone-blue";
  if (category.includes("采购")) return "tone-yellow";
  if (category.includes("约会")) return "tone-pink";
  if (category.includes("健康")) return "tone-mint";
  if (category.includes("记录")) return "tone-purple";
  return "tone-blue";
}
