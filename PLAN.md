# 内部项目需求协作平台实施计划

## 1. 目标与边界

在独立的 `task-platform/` pnpm workspace 中实现可由 Docker Compose 部署到 NAS 的响应式私有生活空间。当前只启用默认空间 `la vie`，仍以项目成员关系作为权限边界，覆盖账号、成员、日历、手帐、点评、清单、留言、附件、通知和管理员操作；不提供公开任务市场、支付、即时聊天、地图、原生 App 和多租户。

## 2. 模块与依赖

```text
Next.js Web
  └─ 同源 /api/v1 fetch 客户端
       └─ Nginx
            ├─ / -> Next.js
            ├─ /api/* -> NestJS
            └─ /uploads/* -> NestJS 受控下载

NestJS API
  ├─ AuthModule -> PrismaModule, AuditModule
  ├─ UsersModule -> PrismaModule, StorageModule
  ├─ EntriesModule -> PrismaModule（手帐、点评、Markdown 导入、版本记录）
  ├─ TasksModule -> PrismaModule, NotificationsModule, AuditModule
  ├─ CollaborationModule -> PrismaModule, TasksModule, NotificationsModule
  ├─ NotificationsModule -> PrismaModule
  ├─ AdminModule -> PrismaModule, AuditModule
  ├─ StorageModule -> 本地 NAS 绑定目录（可替换 S3/MinIO）
  └─ PrismaModule -> PostgreSQL
```

共享 Zod 规则与 API 类型位于 `packages/`，前后端通过 workspace 依赖复用。

## 3. 数据库 ER 关系

```text
User 1─N AuthSession
User N─N Project (through ProjectMember with role)
Project 1─N Task
User 1─N Task (publisher)
Task 1─N TaskRequirement
Task 1─N TaskAttachment
Task 1─N TaskApplication N─1 User (applicant)
Task 1─N TaskAssignment N─1 User (assignee)
Task 1─N TaskSubmission N─1 User (submitter)
TaskSubmission 1─N SubmissionAttachment
Task 1─N TaskComment N─1 User (author)
User 1─N Notification
User 0..1─N AuditLog (actor)
User 1─N Entry (created/updated)
Entry 1─N EntryVersion
```

所有业务主键为 UUID，金额为 PostgreSQL `Decimal(18,2)`，时间为 `timestamptz` 语义并由应用统一按 UTC 输出。重要业务历史不使用级联删除。

项目角色权限：

```text
OWNER   项目设置、成员与所有任务
MANAGER 成员管理（不含负责人/管理员）与所有任务
MEMBER  创建任务、领取任务和参与讨论
VIEWER  只读访问项目任务与讨论
```

## 4. 任务状态机

```text
DRAFT -> PUBLISHED | CANCELLED
PUBLISHED -> CLAIMED | CANCELLED | REMOVED
CLAIMED -> IN_PROGRESS | CANCELLED | DISPUTED
IN_PROGRESS -> SUBMITTED | DISPUTED
SUBMITTED -> REVISION_REQUESTED | COMPLETED | DISPUTED
REVISION_REQUESTED -> SUBMITTED | DISPUTED
DISPUTED -> IN_PROGRESS | COMPLETED | CANCELLED
```

状态只允许通过专用命令服务变更。AUTO 接取和 APPROVAL 接受在 Serializable 事务中锁定任务记录，并使用 `(taskId, assigneeId)` 唯一约束及名额计数二次校验防止超额接取。

## 5. 计划文件

- 根目录：workspace 配置、环境模板、Compose、README、AGENTS、忽略规则。
- `apps/api`：NestJS 模块、Prisma schema/migration/seed、管理员初始化、Dockerfile、单元和集成测试。
- `apps/web`：Next.js App Router 页面、组件、API 客户端、PWA 清单、Dockerfile、组件测试和 Playwright E2E。
- `packages/shared-types`、`packages/shared-validation`：共享契约。
- `infrastructure/nginx`：同源反向代理和安全头。
- `infrastructure/scripts`：数据库及上传清单备份、恢复。
- `data/*/.gitkeep`：NAS 持久化目录占位。

## 6. 风险与控制

- **并发超额接取**：Serializable 事务、任务行锁、唯一约束、冲突重试与集成测试。
- **Cookie + CSRF**：HttpOnly token Cookie、SameSite=Lax、写请求要求同源检查和 `X-CSRF-Token` 双提交值。
- **私密资源泄漏**：任务、留言、附件查询统一走参与者/管理员权限服务，不暴露真实磁盘路径。
- **NAS 权限差异**：容器使用固定非 root UID/GID，并在文档说明数据目录授权。
- **多架构原生依赖**：使用 Debian slim Node 镜像并在目标架构内构建 Argon2/Prisma。
- **生产初始化**：生产启动只执行迁移，不自动 seed；管理员由显式命令创建。
- **范围较大**：先完成端到端核心闭环，再补齐次要页面和覆盖测试；未完成项必须在 README 和最终交付中明确列出。

## 7. 阶段验证

1. 基础工程：安装依赖、lint、类型检查、镜像配置静态检查。
2. 数据库与认证：Prisma validate/generate、认证单元测试。
3. 核心任务：状态机、权限和并发接取测试。
4. 前端：构建、组件测试、320/375/768/1024/1440 布局检查。
5. 部署：Compose config、容器构建、健康检查和完整 E2E（Docker 可用时）。
6. 文档：按全新 NAS 部署演练命令复核。
