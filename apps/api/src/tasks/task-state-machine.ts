import { BadRequestException } from "@nestjs/common";
import type { TaskStatus } from "../generated/prisma/enums";

const transitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  DRAFT: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["CLAIMED", "CANCELLED", "REMOVED"],
  CLAIMED: ["IN_PROGRESS", "CANCELLED", "DISPUTED"],
  IN_PROGRESS: ["SUBMITTED", "DISPUTED"],
  SUBMITTED: ["REVISION_REQUESTED", "COMPLETED", "DISPUTED"],
  REVISION_REQUESTED: ["SUBMITTED", "DISPUTED"],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  REMOVED: ["PUBLISHED"],
};

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!transitions[from].includes(to)) {
    throw new BadRequestException({
      code: "INVALID_TASK_TRANSITION",
      message: `任务不能从 ${from} 变更为 ${to}`,
    });
  }
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}
