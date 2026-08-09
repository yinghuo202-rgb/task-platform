import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { SharedWishesController } from "./shared-wishes.controller";
import { SharedWishesService } from "./shared-wishes.service";

@Module({ imports: [ProjectsModule], controllers: [SharedWishesController], providers: [SharedWishesService] })
export class SharedWishesModule {}
