import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsOptional, IsString, Length, MaxLength } from "class-validator";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser, Public } from "../common/decorators";
import { StorageService, type UploadFile } from "../storage/storage.service";
import { UsersService } from "./users.service";

class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 64)
  displayName?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  bio?: string;
}

@ApiTags("Users")
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService, private readonly storage: StorageService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Patch("me")
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.update(user.id, dto);
  }

  @Post("me/avatar")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async avatar(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadFile) {
    const stored = await this.storage.save(file, "avatar");
    try {
      return await this.users.setAvatar(user.id, stored.storageName);
    } catch (error) {
      await this.storage.remove(stored.storageName);
      throw error;
    }
  }

  @Delete("me/avatar")
  async deleteAvatar(@CurrentUser() user: AuthUser) {
    const old = await this.users.removeAvatar(user.id);
    if (old) await this.storage.remove(old);
    return { success: true };
  }

  @Public()
  @Get(":id/public-profile")
  profile(@Param("id") id: string) {
    return this.users.publicProfile(id);
  }
}
