import { Global, Module } from "@nestjs/common";
import { TasksModule } from "../tasks/tasks.module";
import { StorageController } from "./storage.controller";
import { StorageService } from "./storage.service";

@Global()
@Module({
  imports: [TasksModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
