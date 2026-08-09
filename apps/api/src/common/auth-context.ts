import type { Request } from "express";
import type { UserRole } from "../generated/prisma/enums";

export type AuthUser = {
  id: string;
  sessionId: string;
  role: UserRole;
};

export type AuthenticatedRequest = Request & {
  auth: AuthUser;
  requestId: string;
};
