import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import Joi from "joi";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import { CalendarModule } from "./calendar/calendar.module";
import { AuthGuard } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { RolesGuard } from "./auth/roles.guard";
import { CollaborationModule } from "./collaboration/collaboration.module";
import { SecurityMiddleware } from "./common/security.middleware";
import { HealthController } from "./health.controller";
import { NotificationsModule } from "./notifications/notifications.module";
import { EntriesModule } from "./entries/entries.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProjectsModule } from "./projects/projects.module";
import { SharedWishesModule } from "./shared-wishes/shared-wishes.module";
import { StorageModule } from "./storage/storage.module";
import { TasksModule } from "./tasks/tasks.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        APP_ENV: Joi.string().valid("development", "test", "production").default("development"),
        APP_PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().required(),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default("15m"),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default("30d"),
        PUBLIC_APP_URL: Joi.string().uri().required(),
        ALLOWED_ORIGINS: Joi.string().allow("").default(""),
        REGISTRATION_INVITE_CODE: Joi.string().allow("").min(12).default(""),
        COOKIE_SECURE: Joi.boolean().truthy("true").falsy("false").default(false),
        UPLOAD_DIR: Joi.string().default("/data/uploads"),
        JOURNAL_IMPORT_DIR: Joi.string().default("/data/journal-import"),
        MAX_UPLOAD_SIZE_MB: Joi.number().min(1).max(100).default(20),
        MAX_FILES_PER_REQUEST: Joi.number().min(1).max(20).default(10),
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    CalendarModule,
    AuthModule,
    ProjectsModule,
    SharedWishesModule,
    TasksModule,
    CollaborationModule,
    StorageModule,
    UsersModule,
    NotificationsModule,
    EntriesModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityMiddleware).forRoutes("{*path}");
  }
}
