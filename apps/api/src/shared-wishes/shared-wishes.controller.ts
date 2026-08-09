import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser } from "../common/decorators";
import { CompleteSharedWishDto, CreateSharedWishDto } from "./dto";
import { SharedWishesService } from "./shared-wishes.service";

@ApiTags("Shared wishes")
@Controller("shared-wishes")
export class SharedWishesController {
  constructor(private readonly wishes: SharedWishesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.wishes.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSharedWishDto) {
    return this.wishes.create(user, dto.title);
  }

  @Patch(":id/completed")
  complete(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: CompleteSharedWishDto) {
    return this.wishes.complete(id, user, dto.completed);
  }
}
