import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { AuthUser } from "../common/auth-context";
import { CurrentUser, Public } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { StorageService, type UploadFile } from "./storage.service";

@ApiTags("Attachments")
@Controller()
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  @Post("tasks/:id/attachments")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async taskUpload(@Param("id") taskId: string, @CurrentUser() user: AuthUser, @UploadedFile() file: UploadFile) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: { _count: { select: { attachments: true } } } });
    if (!task) throw new NotFoundException("任务不存在");
    await this.tasks.assertContributor(taskId, user);
    if (task.publisherId !== user.id || !["DRAFT", "PUBLISHED"].includes(task.status)) throw new ForbiddenException("当前不能上传任务附件");
    if (task._count.attachments >= Number(process.env.MAX_FILES_PER_REQUEST ?? 10)) throw new ForbiddenException("任务附件数量已达上限");
    const stored = await this.storage.save(file, "task");
    return this.prisma.taskAttachment.create({ data: { taskId, uploaderId: user.id, ...stored } });
  }

  @Post("submissions/:id/attachments")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async submissionUpload(@Param("id") submissionId: string, @CurrentUser() user: AuthUser, @UploadedFile() file: UploadFile) {
    const submission = await this.prisma.taskSubmission.findUnique({ where: { id: submissionId }, include: { _count: { select: { attachments: true } } } });
    if (!submission) throw new NotFoundException("成果不存在");
    await this.tasks.assertContributor(submission.taskId, user);
    if (submission.submitterId !== user.id) throw new ForbiddenException("只能上传自己的成果附件");
    if (submission._count.attachments >= Number(process.env.MAX_FILES_PER_REQUEST ?? 10)) throw new ForbiddenException("成果附件数量已达上限");
    const stored = await this.storage.save(file, "submission");
    return this.prisma.submissionAttachment.create({ data: { submissionId, uploaderId: user.id, ...stored } });
  }

  @Post("applications/:id/attachments")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async applicationUpload(@Param("id") applicationId: string, @CurrentUser() user: AuthUser, @UploadedFile() file: UploadFile) {
    const application = await this.prisma.taskApplication.findUnique({ where: { id: applicationId }, include: { _count: { select: { attachments: true } } } });
    if (!application) throw new NotFoundException("申请不存在");
    await this.tasks.assertContributor(application.taskId, user);
    if (application.applicantId !== user.id || application.status !== "PENDING") throw new ForbiddenException("当前不能上传申请附件");
    if (application._count.attachments >= Number(process.env.MAX_FILES_PER_REQUEST ?? 10)) throw new ForbiddenException("申请附件数量已达上限");
    const stored = await this.storage.save(file, "application");
    return this.prisma.applicationAttachment.create({ data: { applicationId, uploaderId: user.id, ...stored } });
  }

  @Public()
  @Get("avatars/:storageName")
  avatar(@Param("storageName") storageName: string, @Res() res: Response) {
    return res.sendFile(this.storage.path(`avatar/${storageName}`));
  }

  @Get("attachments/:id")
  async download(@Param("id") id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const taskFile = await this.prisma.taskAttachment.findUnique({ where: { id } });
    if (taskFile) {
      const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskFile.taskId } });
      await this.tasks.assertParticipant(task.id, user);
      return res.download(this.storage.path(taskFile.storageName), taskFile.originalName);
    }
    const submissionFile = await this.prisma.submissionAttachment.findUnique({ where: { id }, include: { submission: true } });
    if (submissionFile) {
      await this.tasks.assertParticipant(submissionFile.submission.taskId, user);
      return res.download(this.storage.path(submissionFile.storageName), submissionFile.originalName);
    }
    const applicationFile = await this.prisma.applicationAttachment.findUnique({ where: { id }, include: { application: { include: { task: true } } } });
    if (!applicationFile) throw new NotFoundException("附件不存在");
    await this.tasks.assertParticipant(applicationFile.application.taskId, user);
    if (applicationFile.application.applicantId !== user.id && applicationFile.application.task.publisherId !== user.id && user.role !== "ADMIN") throw new ForbiddenException("无权下载此申请附件");
    return res.download(this.storage.path(applicationFile.storageName), applicationFile.originalName);
  }
}
