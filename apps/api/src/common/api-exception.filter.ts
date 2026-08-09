import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

type ErrorBody = {
  code?: string;
  message?: string | string[];
  details?: unknown[];
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { requestId?: string }>();
    const res = http.getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = error instanceof HttpException ? error.getResponse() : undefined;
    const body: ErrorBody = typeof response === "object" && response !== null ? response : {};
    const rawMessage = body.message ?? (typeof response === "string" ? response : "服务器内部错误");
    const message = Array.isArray(rawMessage) ? rawMessage.join("；") : rawMessage;

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.originalUrl} requestId=${req.requestId ?? "unknown"}`, error instanceof Error ? error.stack : undefined);
    }

    res.status(status).json({
      statusCode: status,
      code: body.code ?? defaultCode(status),
      message,
      details: body.details ?? (Array.isArray(rawMessage) ? rawMessage : []),
      requestId: req.requestId ?? "unknown",
    });
  }
}

function defaultCode(status: number): string {
  return status === 400 ? "VALIDATION_ERROR"
    : status === 401 ? "UNAUTHORIZED"
    : status === 403 ? "FORBIDDEN"
    : status === 404 ? "NOT_FOUND"
    : status === 409 ? "CONFLICT"
    : "INTERNAL_ERROR";
}
