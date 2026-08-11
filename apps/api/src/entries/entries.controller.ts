import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser, Roles } from "../common/decorators";
import { UserRole } from "../generated/prisma/enums";
import { BatchEntriesDto, CreateEntryCommentDto, CreateEntryDto, ListEntriesDto, UpdateEntryDto } from "./dto";
import { EntriesService } from "./entries.service";

@ApiTags("Entries")
@Controller("entries")
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListEntriesDto) {
    return this.entries.list(user, query);
  }

  @Get("batch")
  batch(@CurrentUser() user: AuthUser, @Query() query: BatchEntriesDto) {
    return this.entries.getMany(user, query.ids);
  }

  @Get("assets/:storageName")
  async asset(
    @CurrentUser() user: AuthUser,
    @Param("storageName") storageName: string,
    @Res() response: Response,
  ) {
    return response.sendFile(await this.entries.journalAsset(user, storageName));
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.entries.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEntryDto) {
    return this.entries.create(user, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateEntryDto) {
    return this.entries.update(user, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.entries.remove(user, id);
  }

  @Get(":id/comments")
  comments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.entries.listComments(user, id);
  }

  @Post(":id/comments")
  comment(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreateEntryCommentDto) {
    return this.entries.createComment(user, id, dto);
  }

  @Delete(":id/comments/:commentId")
  removeComment(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("commentId") commentId: string) {
    return this.entries.removeComment(user, id, commentId);
  }

  @Post("import")
  @Roles(UserRole.ADMIN)
  import(@CurrentUser() user: AuthUser) {
    return this.entries.importMarkdown(user);
  }
}
