import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  me(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, username: true, email: true, displayName: true, avatarPath: true, bio: true, role: true, status: true, createdAt: true, lastLoginAt: true },
    });
  }

  async update(id: string, input: { displayName?: string; bio?: string }) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
        ...(input.bio !== undefined ? { bio: input.bio.trim() || null } : {}),
      },
      select: { id: true, username: true, email: true, displayName: true, avatarPath: true, bio: true, role: true, status: true },
    });
  }

  async publicProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, displayName: true, avatarPath: true, bio: true, createdAt: true },
    });
    if (!user) throw new NotFoundException("用户不存在");
    return user;
  }

  async setAvatar(id: string, storageName: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.avatarPath) throw new ConflictException("请先删除现有头像");
    return this.prisma.user.update({ where: { id }, data: { avatarPath: storageName }, select: { avatarPath: true } });
  }

  async removeAvatar(id: string): Promise<string | null> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    await this.prisma.user.update({ where: { id }, data: { avatarPath: null } });
    return user.avatarPath;
  }
}
