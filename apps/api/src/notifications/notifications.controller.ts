import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser } from "../common/decorators";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("Notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query("page") rawPage?: string, @Query("pageSize") rawPageSize?: string) {
    const page = Math.max(1, Number(rawPage) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(rawPageSize) || 20));
    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(user.role === "ADMIN" ? {} : {
        OR: [
          { taskId: null },
          { task: { project: { members: { some: { userId: user.id } } } } },
        ],
      }),
    };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { data: items, meta: { page, pageSize, total, unread, totalPages: Math.ceil(total / pageSize) } };
  }

  @Post(":id/read")
  read(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  }

  @Post("read-all")
  readAll(@CurrentUser() user: AuthUser) {
    return this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  }
}
