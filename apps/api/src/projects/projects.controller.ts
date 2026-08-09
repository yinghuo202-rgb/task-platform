import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser, Roles } from "../common/decorators";
import { UserRole } from "../generated/prisma/enums";
import {
  AddProjectMemberDto,
  CreateProjectDto,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from "./dto";
import { ProjectsService } from "./projects.service";

@ApiTags("Projects")
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.projects.get(id, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, user, dto);
  }

  @Delete(":id")
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.projects.archive(id, user);
  }

  @Post(":id/members")
  addMember(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: AddProjectMemberDto) {
    return this.projects.addMember(id, user, dto);
  }

  @Patch(":id/members/:memberId")
  updateMember(@Param("id") id: string, @Param("memberId") memberId: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateProjectMemberDto) {
    return this.projects.updateMember(id, memberId, user, dto.role);
  }

  @Delete(":id/members/:memberId")
  removeMember(@Param("id") id: string, @Param("memberId") memberId: string, @CurrentUser() user: AuthUser) {
    return this.projects.removeMember(id, memberId, user);
  }
}
