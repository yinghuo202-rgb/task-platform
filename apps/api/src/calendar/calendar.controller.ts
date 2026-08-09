import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser } from "../common/decorators";
import { CalendarService } from "./calendar.service";
import { CalendarRangeDto, CreateCalendarEventDto, RespondCalendarSubscriptionDto, UpdateCalendarEventDto } from "./dto";

@ApiTags("Calendar")
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get("events")
  list(@CurrentUser() user: AuthUser, @Query() range: CalendarRangeDto) {
    return this.calendar.list(user.id, new Date(range.from), new Date(range.to));
  }

  @Post("events")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCalendarEventDto) {
    return this.calendar.create(user.id, dto);
  }

  @Patch("events/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateCalendarEventDto) {
    return this.calendar.update(user.id, id, dto);
  }

  @Delete("events/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.calendar.remove(user.id, id);
  }

  @Get("feed")
  feed(@CurrentUser() user: AuthUser, @Query() range: CalendarRangeDto) {
    return this.calendar.feed(user.id, new Date(range.from), new Date(range.to));
  }

  @Get("subscriptions")
  subscriptions(@CurrentUser() user: AuthUser) {
    return this.calendar.subscriptionOverview(user.id);
  }

  @Post("subscriptions/:ownerId")
  requestSubscription(@CurrentUser() user: AuthUser, @Param("ownerId") ownerId: string) {
    return this.calendar.requestSubscription(user.id, ownerId);
  }

  @Patch("subscriptions/:id/respond")
  respond(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: RespondCalendarSubscriptionDto) {
    return this.calendar.respondToSubscription(user.id, id, dto);
  }

  @Delete("subscriptions/:id")
  cancelSubscription(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.calendar.cancelSubscription(user.id, id);
  }
}
