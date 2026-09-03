import Link from "next/link";
import type { TaskSummary } from "@task-platform/shared-types";
import { Clock3 } from "lucide-react";
import { taskTimeLabel } from "@/lib/task-time";
import { StatusBadge } from "./ui";

export function TaskCard({ task }: { task: TaskSummary }) {
  return <Link className="card task-card" href={`/tasks/${task.id}`}>
    <div className="task-card-art tone-blue"><span>🫶</span><StatusBadge status={task.status} /><i /><i /></div>
    <div className="task-card-top"><span className="project-pill"><i style={{ background: task.project.color }} />la vie</span></div>
    <h3>{task.title}</h3>
    <p>{task.summary}</p>
    <div className="task-footer"><span className="task-publisher"><span className="avatar-placeholder">{task.publisher.displayName.slice(0, 1)}</span><span>{task.publisher.displayName} 写下</span></span><span className="task-deadline"><Clock3 size={14} />{taskTimeLabel(task)}</span></div>
  </Link>;
}
