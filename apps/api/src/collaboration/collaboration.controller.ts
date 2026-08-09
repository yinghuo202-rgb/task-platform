import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser } from "../common/decorators";
import { CollaborationService } from "./collaboration.service";
import { ApplicationDto, CommentDto, RevisionDto, SubmissionDto } from "./dto";

@ApiTags("Applications, submissions and comments")
@Controller()
export class CollaborationController {
  constructor(private readonly service: CollaborationService) {}

  @Get("tasks/:id/applications")
  applications(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.applications(id, user);
  }

  @Post("tasks/:id/applications")
  apply(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: ApplicationDto) {
    return this.service.apply(id, user, dto.message);
  }

  @Post("tasks/:id/claim")
  claim(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.claim(id, user);
  }

  @Post("applications/:id/accept")
  accept(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.accept(id, user);
  }

  @Post("applications/:id/reject")
  reject(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.reject(id, user);
  }

  @Post("applications/:id/withdraw")
  withdraw(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.withdraw(id, user);
  }

  @Get("tasks/:id/submissions")
  submissions(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.submissions(id, user);
  }

  @Post("tasks/:id/submissions")
  submit(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: SubmissionDto) {
    return this.service.submit(id, user, dto.content);
  }

  @Post("submissions/:id/approve")
  approve(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, user);
  }

  @Post("submissions/:id/request-revision")
  revision(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: RevisionDto) {
    return this.service.requestRevision(id, user, dto.message);
  }

  @Get("tasks/:id/comments")
  comments(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.comments(id, user);
  }

  @Post("tasks/:id/comments")
  comment(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: CommentDto) {
    return this.service.comment(id, user, dto.content);
  }

  @Patch("comments/:id")
  edit(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: CommentDto) {
    return this.service.editComment(id, user, dto.content);
  }

  @Delete("comments/:id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteComment(id, user);
  }
}
