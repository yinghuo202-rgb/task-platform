import { Module } from "@nestjs/common";
import { TasksModule } from "../tasks/tasks.module";
import { CollaborationController } from "./collaboration.controller";
import { CollaborationService } from "./collaboration.service";

@Module({
  imports: [TasksModule],
  controllers: [CollaborationController],
  providers: [CollaborationService],
})
export class CollaborationModule {}
