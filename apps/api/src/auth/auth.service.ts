import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { Request, Response } from "express";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChangePasswordDto, LoginDto, RegisterDto } from "./dto";

type TokenPayload = { sub: string; sid: string; role: "USER" | "ADMIN"; type: "access" | "refresh" };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto, req: Request, res: Response) {
    this.assertRegistrationAllowed(dto.inviteCode);
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();
    const exists = await this.prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (exists) throw new ConflictException({ code: "ACCOUNT_EXISTS", message: "用户名或邮箱已被使用" });

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        displayName: dto.displayName.trim(),
        passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
      },
    });
    await this.audit.record({ actorId: user.id, action: "USER_REGISTERED", entityType: "User", entityId: user.id, ...clientInfo(req) });
    await this.createSession(user, req, res);
    return publicUser(user);
  }

  private assertRegistrationAllowed(provided?: string): void {
    const inviteCode = this.config.get<string>("REGISTRATION_INVITE_CODE", "");
    const privateRegistration = this.config.get<string>("APP_ENV") === "production" || Boolean(inviteCode);
    if (!privateRegistration) return;
    if (!inviteCode || !safeEqual(inviteCode, provided ?? "")) {
      throw new ForbiddenException({ code: "INVALID_INVITE_CODE", message: "空间邀请码不正确" });
    }
  }

  async login(dto: LoginDto, req: Request, res: Response) {
    const identifier = dto.identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: { equals: dto.identifier.trim(), mode: "insensitive" } }] },
    });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "用户名、邮箱或密码错误" });
    }
    if (user.status !== "ACTIVE") throw new UnauthorizedException({ code: "ACCOUNT_DISABLED", message: "账号已被禁用" });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.createSession(user, req, res);
    return publicUser(user);
  }

  async refresh(req: Request, res: Response) {
    const token = typeof req.cookies?.refresh_token === "string" ? req.cookies.refresh_token : "";
    if (!token) throw new UnauthorizedException("刷新会话已失效");
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, { secret: this.config.getOrThrow("JWT_REFRESH_SECRET") });
      if (payload.type !== "refresh") throw new Error("invalid token type");
      const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid }, include: { user: true } });
      if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") throw new Error("revoked");
      if (!(await argon2.verify(session.refreshTokenHash, token))) throw new Error("rotated");
      await this.rotateSession(session.id, session.user, res);
      return publicUser(session.user);
    } catch {
      this.clearCookies(res);
      throw new UnauthorizedException("刷新会话已失效");
    }
  }

  async logout(sessionId: string, res: Response): Promise<{ success: true }> {
    await this.prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.clearCookies(res);
    return { success: true };
  }

  async logoutAll(userId: string, res: Response): Promise<{ success: true }> {
    await this.prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.clearCookies(res);
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return publicUser(user);
  }

  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto): Promise<{ success: true }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) throw new UnauthorizedException("当前密码错误");
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await argon2.hash(dto.newPassword, { type: argon2.argon2id }) },
      }),
      this.prisma.authSession.updateMany({
        where: { userId, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({ actorId: userId, action: "PASSWORD_CHANGED", entityType: "User", entityId: userId });
    return { success: true };
  }

  private async createSession(user: { id: string; role: "USER" | "ADMIN" }, req: Request, res: Response): Promise<void> {
    const csrfToken = randomBytes(32).toString("base64url");
    const placeholder = await argon2.hash(randomBytes(48).toString("base64url"), { type: argon2.argon2id });
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: placeholder,
        csrfToken,
        expiresAt: new Date(Date.now() + durationMs(this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "30d"), 30 * 24 * 60 * 60 * 1000)),
        ...clientInfo(req),
      },
    });
    await this.rotateSession(session.id, user, res, csrfToken);
  }

  private async rotateSession(
    sessionId: string,
    user: { id: string; role: "USER" | "ADMIN" },
    res: Response,
    existingCsrf?: string,
  ): Promise<void> {
    const accessMaxAge = durationMs(this.config.get<string>("JWT_ACCESS_EXPIRES_IN", "15m"), 15 * 60 * 1000);
    const refreshMaxAge = durationMs(this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "30d"), 30 * 24 * 60 * 60 * 1000);
    const access = await this.sign({ sub: user.id, sid: sessionId, role: user.role, type: "access" }, "JWT_ACCESS_SECRET", "JWT_ACCESS_EXPIRES_IN");
    const refresh = await this.sign({ sub: user.id, sid: sessionId, role: user.role, type: "refresh" }, "JWT_REFRESH_SECRET", "JWT_REFRESH_EXPIRES_IN");
    const csrfToken = existingCsrf ?? randomBytes(32).toString("base64url");
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: await argon2.hash(refresh, { type: argon2.argon2id }),
        csrfToken,
        expiresAt: new Date(Date.now() + refreshMaxAge),
      },
    });
    const secureValue = this.config.get<boolean | string>("COOKIE_SECURE", false);
    const secure = secureValue === true || secureValue === "true";
    const domain = this.config.get<string>("COOKIE_DOMAIN") || undefined;
    const common = { secure, sameSite: "lax" as const, path: "/", domain };
    res.cookie("access_token", access, { ...common, httpOnly: true, maxAge: accessMaxAge });
    res.cookie("refresh_token", refresh, { ...common, httpOnly: true, maxAge: refreshMaxAge });
    res.cookie("csrf_token", csrfToken, { ...common, httpOnly: false, maxAge: refreshMaxAge });
  }

  private sign(payload: TokenPayload, secretKey: string, expiresKey: string): Promise<string> {
    const options: JwtSignOptions = {
      secret: this.config.getOrThrow<string>(secretKey),
      expiresIn: this.config.getOrThrow<string>(expiresKey) as JwtSignOptions["expiresIn"],
    };
    return this.jwt.signAsync(payload, options);
  }

  private clearCookies(res: Response): void {
    const secureValue = this.config.get<boolean | string>("COOKIE_SECURE", false);
    const secure = secureValue === true || secureValue === "true";
    const domain = this.config.get<string>("COOKIE_DOMAIN") || undefined;
    for (const name of ["access_token", "refresh_token", "csrf_token"]) {
      res.clearCookie(name, { path: "/", sameSite: "lax", secure, domain });
    }
  }
}

function durationMs(value: string, fallback: number): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return fallback;
  const multiplier = match[2] === "d" ? 86_400_000 : match[2] === "h" ? 3_600_000 : match[2] === "m" ? 60_000 : 1_000;
  return amount * multiplier;
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

function clientInfo(req: Request): { ipAddress?: string; userAgent?: string } {
  const ipAddress = req.ip?.slice(0, 64);
  const userAgent = req.header("user-agent")?.slice(0, 500);
  return { ...(ipAddress ? { ipAddress } : {}), ...(userAgent ? { userAgent } : {}) };
}

function publicUser(user: { id: string; username: string; email: string; displayName: string; avatarPath: string | null; bio: string | null; role: "USER" | "ADMIN"; status: "ACTIVE" | "DISABLED" }) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarPath: user.avatarPath,
    bio: user.bio,
    role: user.role,
    status: user.status,
  };
}
