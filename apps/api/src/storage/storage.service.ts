import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const allowed = new Map([
  [".jpg", ["image/jpeg"]],
  [".jpeg", ["image/jpeg"]],
  [".png", ["image/png"]],
  [".webp", ["image/webp"]],
  [".pdf", ["application/pdf"]],
  [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]],
  [".xlsx", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]],
  [".txt", ["text/plain"]],
  [".zip", ["application/zip", "application/x-zip-compressed"]],
]);

@Injectable()
export class StorageService {
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>("UPLOAD_DIR") ?? "/data/uploads");
    this.maxBytes = Number(config.get<string>("MAX_UPLOAD_SIZE_MB") ?? 20) * 1024 * 1024;
  }

  async save(file: UploadFile | undefined, namespace: "avatar" | "task" | "application" | "submission") {
    if (!file) throw new BadRequestException("请选择文件");
    if (file.size > this.maxBytes) throw new BadRequestException({ code: "FILE_TOO_LARGE", message: "文件超过大小限制" });
    const extension = extname(file.originalname).toLowerCase();
    if (!allowed.get(extension)?.includes(file.mimetype)) throw new BadRequestException({ code: "FILE_TYPE_NOT_ALLOWED", message: "不支持此文件类型" });
    if (namespace === "avatar" && !file.mimetype.startsWith("image/")) throw new BadRequestException("头像只能使用图片");
    const storageName = `${namespace}/${randomUUID()}${extension}`;
    const target = this.resolveSafe(storageName);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, file.buffer, { flag: "wx", mode: 0o640 });
    return { storageName, originalName: file.originalname.slice(0, 255), mimeType: file.mimetype, size: file.size };
  }

  path(storageName: string): string {
    return this.resolveSafe(storageName);
  }

  async remove(storageName: string): Promise<void> {
    await rm(this.resolveSafe(storageName), { force: true });
  }

  private resolveSafe(storageName: string): string {
    const path = resolve(this.root, storageName);
    if (!path.startsWith(`${this.root}/`)) throw new BadRequestException("非法文件路径");
    return path;
  }
}

export type UploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
