import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { AuthenticatedRequest, AuthUser } from "./auth-context";
import type { UserRole } from "../generated/prisma/enums";

export const IS_PUBLIC_KEY = "isPublic";
export const SKIP_CSRF_KEY = "skipCsrf";
export const ROLES_KEY = "roles";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
