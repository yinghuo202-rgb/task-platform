import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser } from "../common/decorators";
import { CreateTaskDto, ListTasksDto, UpdateTaskDto } from "./dto";
import { TasksService } from "./tasks.service";

@ApiTags("Tasks")
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Query() query: ListTasksDto, @CurrentUser() user: AuthUser) {
    return this.tasks.list(query, user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.tasks.get(id, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, user, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.tasks.removeDraft(id, user);
  }

  @Post(":id/publish")
  publish(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.tasks.publish(id, user);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.tasks.cancel(id, user);
  }

  @Post(":id/start")
  start(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.tasks.start(id, user);
  }

  @Post(":id/dispute")
  dispute(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body("message") message: string) {
    return this.tasks.dispute(id, user, message);
  }
}
