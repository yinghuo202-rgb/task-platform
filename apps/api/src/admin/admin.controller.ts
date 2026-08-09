import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser, Roles } from "../common/decorators";
import { ProjectRole, TaskStatus, UserRole, UserStatus } from "../generated/prisma/enums";
import { AdminService } from "./admin.service";

class UserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}

class ProjectAccessDto {
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

class ResolveDto {
  @IsEnum(["IN_PROGRESS", "COMPLETED", "CANCELLED"])
  status!: Extract<TaskStatus, "IN_PROGRESS" | "COMPLETED" | "CANCELLED">;

  @IsString() @MinLength(1) @MaxLength(1000)
  message!: string;
}

@ApiTags("Admin")
@Roles(UserRole.ADMIN)
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("users")
  users(@Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("search") search?: string) {
    return this.admin.users(Number(page) || 1, Math.min(Number(pageSize) || 20, 100), search);
  }

  @Patch("users/:id/status")
  status(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UserStatusDto) {
    return this.admin.userStatus(user, id, dto.status);
  }

  @Get("access")
  access() {
    return this.admin.accessOverview();
  }

  @Get("orders")
  orders() {
    return this.admin.orderOverview();
  }

  @Put("users/:userId/projects/:projectId")
  assignProject(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Param("projectId") projectId: string,
    @Body() dto: ProjectAccessDto,
  ) {
    return this.admin.assignProject(user, userId, projectId, dto.role);
  }

  @Delete("users/:userId/projects/:projectId")
  removeProject(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Param("projectId") projectId: string,
  ) {
    return this.admin.removeProject(user, userId, projectId);
  }

  @Get("tasks")
  tasks(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.admin.tasks(Number(page) || 1, Math.min(Number(pageSize) || 20, 100));
  }

  @Post("tasks/:id/remove")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.removeTask(user, id);
  }

  @Post("tasks/:id/restore")
  restore(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.restoreTask(user, id);
  }

  @Get("disputes")
  disputes() {
    return this.admin.disputes();
  }

  @Post("disputes/:taskId/resolve")
  resolve(@CurrentUser() user: AuthUser, @Param("taskId") taskId: string, @Body() dto: ResolveDto) {
    return this.admin.resolve(user, taskId, dto.status, dto.message);
  }

  @Get("audit-logs")
  audit(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.admin.auditLogs(Number(page) || 1, Math.min(Number(pageSize) || 50, 100));
  }
}
