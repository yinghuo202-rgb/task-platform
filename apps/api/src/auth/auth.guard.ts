import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../common/decorators";
import type { AuthUser } from "../common/auth-context";
import { PrismaService } from "../prisma/prisma.service";

type AccessPayload = {
  sub: string;
  sid: string;
  role: AuthUser["role"];
  type: "access";
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthUser }>();
    const token = typeof request.cookies?.access_token === "string" ? request.cookies.access_token : undefined;
    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException("请先登录");
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      if (payload.type !== "access") throw new Error("invalid token type");
      const session = await this.prisma.authSession.findFirst({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
        include: { user: { select: { status: true, role: true } } },
      });
      if (!session || session.user.status !== "ACTIVE") throw new Error("inactive session");
      request.auth = { id: payload.sub, sessionId: payload.sid, role: session.user.role };
      return true;
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException("登录已失效，请重新登录");
    }
  }
}
