import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { map, type Observable } from "rxjs";

type WithMeta = { data: unknown; meta?: Record<string, unknown> };

@Injectable()
export class ApiInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { requestId: string }>();
    return next.handle().pipe(map((value: unknown) => {
      const structured = isWithMeta(value) ? value : { data: value };
      return { ...structured, requestId: request.requestId };
    }));
  }
}

function isWithMeta(value: unknown): value is WithMeta {
  return Boolean(value && typeof value === "object" && "data" in value);
}
