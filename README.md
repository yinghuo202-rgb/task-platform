# la vie

可自托管的两人生活空间：把日历、手帐、点评和待办放在一起。项目采用 Next.js + NestJS + PostgreSQL 单仓库结构，默认通过 Nginx 同源反向代理，可部署到 Synology、QNAP、TrueNAS 或普通 Linux NAS。

> la vie 是私有空间，所有内容都按项目成员权限可见，不提供公开发布或交易撮合。
>
> 当前只保留一个默认空间「la vie」；旧项目不会再进入清单、日历、手帐或管理统计。

## 已实现

- 邀请码注册、密码登录、退出、全部会话退出、修改密码；生产环境不允许公开注册。
- la vie 成员管理，以及空间主人、管理员、可一起编辑、仅查看四级权限。
- Argon2id 密码哈希、Access/Refresh HttpOnly Cookie、Refresh Token 哈希存储和轮换、会话撤销、账号禁用。
- 同源检查、双提交 CSRF Token、安全响应头、参数白名单、限流、统一错误、请求 ID 和脱敏审计。
- 私密清单创建、编辑、取消、搜索、分类/状态筛选、分页和排序。
- 「一起做的事 / 我接取的 / 我发布的」三栏清单；共同愿望可直接勾选，个人任务支持自定义奖励和对方一键接取，并可一键显示完成历史与完成时间。
- AUTO 原子接取和 APPROVAL 申请审批；Serializable 事务、任务行锁及唯一约束防止超额接取。
- 开始任务、提交成果、退回修改、再次提交、验收完成和争议状态。
- 参与者私密留言、站内通知、个人工作台。
- 任务、申请、成果附件和用户头像存储 API；MIME/扩展名/大小/数量/路径校验及受控下载。
- 管理员用户禁用、任务下架/恢复、争议裁定和审计日志。
- 响应式 Web、移动端底部导航、语义化表单、键盘焦点、PWA manifest。
- 首页日历支持月/周/日视图；周视图和日视图可拖动个人日程调整日期与时间，并显示全天手帐标记和当前时间线。
- 手帐与点评在线编辑并保存到 PostgreSQL，支持 Markdown 一次性导入、版本记录、归档、成员回应、日历标记、全部历史时间轴和同日回忆。
- Swagger、Prisma migration、开发 seed、安全管理员初始化、备份/恢复脚本。
- 单元、组件、并发集成及 Playwright 生命周期测试。

## 工程结构

```text
task-platform/
├── apps/
│   ├── api/
│   │   ├── prisma/                 # schema、migration、seed、管理员命令
│   │   ├── src/
│   │   │   ├── admin/
│   │   │   ├── audit/
│   │   │   ├── auth/
│   │   │   ├── collaboration/     # 申请、指派、成果、留言
│   │   │   ├── common/
│   │   │   ├── notifications/
│   │   │   ├── storage/
│   │   │   ├── tasks/
│   │   │   └── users/
│   │   ├── test/
│   │   └── Dockerfile
│   └── web/
│       ├── e2e/
│       ├── public/
│       ├── src/app/
│       ├── src/components/
│       └── Dockerfile
├── packages/
│   ├── shared-types/
│   └── shared-validation/
├── infrastructure/
│   ├── nginx/{Dockerfile,nginx.conf}
│   └── scripts/{backup,restore}.sh
├── data/{postgres,uploads,backups,journal-import}/
├── compose.yaml                    # NAS 生产运行：仅使用镜像
├── compose.build.yaml              # 构建机/CI：构建三个应用镜像
├── compose.dev.yaml
├── PLAN.md
└── .env.example
```

## 数据模型

核心表使用需求约定的名称：

- `users`、`auth_sessions`
- `projects`、`project_members`
- `tasks`、`task_requirements`、`task_attachments`
- `task_applications`、`application_attachments`、`task_assignments`
- `task_submissions`、`submission_attachments`
- `task_comments`、`notifications`、`audit_logs`
- `entries`、`entry_versions`、`entry_comments`（手帐/点评正文、Markdown 导入来源、在线版本与成员回应）
- `shared_wishes`（共同愿望、排序、完成人和完成时间）

所有业务主键为 UUID。奖励金额为 `Decimal(18,2)`；时间由 PostgreSQL/Prisma 以 UTC 写入并以 ISO 时间传输。重要历史外键使用 `RESTRICT`，任务、账号和留言主要通过状态或软删除保留历史。

任务状态只能由专用 API 变化：

```text
DRAFT → PUBLISHED → CLAIMED → IN_PROGRESS → SUBMITTED → COMPLETED
                                        ↘ REVISION_REQUESTED → SUBMITTED
CLAIMED/IN_PROGRESS/SUBMITTED/REVISION_REQUESTED → DISPUTED
```

完整状态图和风险分析见 [PLAN.md](./PLAN.md)。
品牌命名、状态词和界面文案约定见 [界面与文案规范](./docs/ui-content-guide.md)。

## NAS 生产部署

生产环境由四个独立容器组成：`reverse-proxy`、`web`、`api`、`db`。NAS 只拉取或导入 Docker 镜像，不在设备上安装 Node.js、pnpm，也不在启动时编译源码。数据库和上传文件均保存在 NAS 的绝对路径中；删除或升级容器不会删除业务数据。

手帐迁移时，将原有 `.md` 文件复制到 `JOURNAL_IMPORT_PATH` 指向的目录，在「手帐」页由管理员点击“导入 Markdown”。普通 Markdown 仍按单文件导入；目录根部存在 `journal-import-manifest.json` 时，系统会改用结构化迁移，可分别指定正文作者、评论作者并复制清单中的图片。结构化迁移会先核对账号与 `la vie` 成员关系，再按稳定来源标识去重；后续编辑直接写入 PostgreSQL，不会回写源文件。

双人历史手帐可使用 `scripts/prepare-journal-import.mjs` 生成结构化迁移目录。生成结果必须整目录复制，不能只复制 `entries` 下的 Markdown；重复执行导入会跳过已完成的条目，源内容改变时会停止并提示冲突，避免静默产生副本。

### 1. 准备镜像

推荐在开发机或 CI 中构建并推送镜像仓库。先在 `.env` 中把三个镜像名改成实际仓库地址和固定版本号，例如：

```bash
PROXY_IMAGE=registry.example.com/team/task-platform-proxy:1.0.0
WEB_IMAGE=registry.example.com/team/task-platform-web:1.0.0
API_IMAGE=registry.example.com/team/task-platform-api:1.0.0
```

然后在构建机执行：

```bash
docker compose -f compose.yaml -f compose.build.yaml build reverse-proxy web api
docker compose -f compose.yaml -f compose.build.yaml push reverse-proxy web api
```

如果 NAS 无法访问镜像仓库，也可以在构建机用 `docker save` 导出这三个镜像，在 NAS 的容器管理器中导入；生产 `compose.yaml` 不需要改变。

### 2. 准备 NAS 目录与部署文件

NAS 仅需保存 `compose.yaml`、`.env` 和备份脚本，不需要保存应用源码。以群晖路径为例：

```bash
mkdir -p /volume1/docker/task-platform/deploy/infrastructure/scripts
mkdir -p /volume1/docker/task-platform/data/{postgres,uploads,backups,journal-import}
cd /volume1/docker/task-platform/deploy
# 将 compose.yaml、.env.nas.example 和 infrastructure/scripts 复制到此目录
cp .env.nas.example .env
```

### 3. 设置目录权限

API 容器以 UID/GID `10001:10001` 运行。PostgreSQL 官方镜像通常使用 UID/GID `999:999`。在 NAS 上执行：

```bash
sudo chown -R 10001:10001 /volume1/docker/task-platform/data/uploads
sudo chown -R 999:999 /volume1/docker/task-platform/data/postgres /volume1/docker/task-platform/data/backups
sudo chmod 750 /volume1/docker/task-platform/data/{postgres,uploads,backups}
```

部分 NAS 会重新映射 UID；若 PostgreSQL 日志提示无写权限，以目标镜像实际 UID 为准调整，不要改成全局 `777`。

### 4. 配置镜像、密钥和持久化路径

编辑 `.env`，至少修改以下内容。生产环境建议使用固定版本镜像，不使用会漂移的 `latest` 标签：

```bash
PROXY_IMAGE=registry.example.com/team/task-platform-proxy:1.0.0
WEB_IMAGE=registry.example.com/team/task-platform-web:1.0.0
API_IMAGE=registry.example.com/team/task-platform-api:1.0.0
POSTGRES_IMAGE=postgres:17.5-bookworm
IMAGE_PULL_POLICY=missing
POSTGRES_PASSWORD=<高强度随机密码>
DATABASE_URL=postgresql://task_platform:<同一个URL编码后的密码>@db:5432/task_platform
JWT_ACCESS_SECRET=<独立随机密钥>
JWT_REFRESH_SECRET=<另一条独立随机密钥>
REGISTRATION_INVITE_CODE=<仅告知空间成员的邀请码>
APP_PLATFORM=linux/amd64
PUBLIC_APP_URL=http://NAS_IP:8080
POSTGRES_DATA_PATH=/volume1/docker/task-platform/data/postgres
UPLOAD_DATA_PATH=/volume1/docker/task-platform/data/uploads
BACKUP_DATA_PATH=/volume1/docker/task-platform/data/backups
```

可生成密钥：

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 36
```

数据库密码若包含 `@ : / ? # %` 等字符，`DATABASE_URL` 中必须进行 URL 编码。`.env` 不应提交到 Git。

### 5. 拉取镜像并启动

```bash
docker compose config
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f api
```

启动命令不包含 `--build`。Compose 文件也没有生产 `build` 配置，因此 NAS 的程序来源始终是 Docker 镜像。

API 容器在启动应用前自动执行已提交的 `prisma migrate deploy`，不会自动运行 seed，也不会创建默认管理员。

默认地址：

- Web：`http://NAS_IP:8080`
- API 健康：`http://NAS_IP:8080/api/v1/health`
- Swagger：`http://NAS_IP:8080/api/docs`

Compose 只向宿主机发布反向代理端口。Web、API 仅 `expose` 到 Docker 网络；PostgreSQL 没有宿主机端口映射，并位于内部 `backend` 网络。

### 6. 创建首个管理员

容器启动后执行一次：

```bash
docker compose exec \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_DISPLAY_NAME=管理员 \
  -e ADMIN_PASSWORD='替换为至少12位强密码' \
  api node_modules/.bin/tsx prisma/create-admin.ts
```

不要把真实管理员密码写入 compose 文件或 Shell 历史。更安全的方式是只执行 `docker compose exec api node_modules/.bin/tsx prisma/create-admin.ts`，然后交互输入。

## HTTPS、域名与 Tailscale

局域网初测可保留 `PUBLIC_PORT=8080` 和 `COOKIE_SECURE=false`。使用域名或外网访问时：

1. 在 NAS 自带反向代理、Tailscale Serve、Caddy 或边界 Nginx 上终止 HTTPS。
2. 将 HTTPS 流量转发到 `http://127.0.0.1:8080`。
3. 设置 `PUBLIC_APP_URL=https://tasks.example.com`、`ALLOWED_ORIGINS=https://tasks.example.com,https://nas-vpn.example.com`、`COOKIE_SECURE=true`。
4. 只在路由器/防火墙开放 80/443；不要暴露 Web、API、PostgreSQL 容器端口。
5. 保留 `X-Forwarded-Proto`、`X-Forwarded-For` 和 `Host` 请求头。

API 会同时接受当前反向代理公开的同源地址，因此从局域网 IP、VPN 地址或外网域名访问时，不必为了“请求来源不受信任”反复更换数据库或 JWT 配置。若还存在第二个固定域名，可将它以逗号分隔写入 `ALLOWED_ORIGINS`。

修改环境变量后执行：

```bash
docker compose up -d --force-recreate reverse-proxy api web
```

`.env.nas.example` 已预置群晖路径；Intel 极空间直接使用 `.env.zspace.example`。生产 `compose.yaml` 仅包含 `image`，并固定为 `linux/amd64`，源码构建被隔离在 `compose.build.yaml`，因此 NAS 端不会意外执行本地构建。

推送 `v*` Git 标签后，[镜像发布工作流](./.github/workflows/release-images.yml) 会为 proxy、web、api 构建并推送 `linux/amd64` 镜像到 GHCR。升级应用时，把 `.env` 中三个应用镜像的版本号改为新版本，然后运行：

```bash
./infrastructure/scripts/update.sh
```

更新脚本会校验 Compose、完整备份数据库和文件、拉取镜像、重建容器并检查健康状态。成功配置保存为 `.env.last-successful`；失败配置另存后会尝试恢复上一次成功版本。数据库和文件始终保留在 NAS 持久化目录中。

### 从旧版本在线更新到 v1.8.0

保留现有 `.env` 中的 `POSTGRES_PASSWORD`、`DATABASE_URL`、两条 JWT 密钥和全部数据路径，只把三条应用镜像改为：

```bash
PROXY_IMAGE=ghcr.io/yinghuo202-rgb/task-platform-proxy:v1.8.0
WEB_IMAGE=ghcr.io/yinghuo202-rgb/task-platform-web:v1.8.0
API_IMAGE=ghcr.io/yinghuo202-rgb/task-platform-api:v1.8.0
```

然后在 Compose 项目目录运行 `./infrastructure/scripts/update.sh`。脚本会先备份再在线拉取镜像；API 启动时会自动执行数据库迁移并导入 57 条「一起做的事」。不要重新初始化 PostgreSQL 目录，也不要再次导入旧镜像包。

导入页面会显示“新增/跳过”数量。如果提示导入目录没有 Markdown，说明迁移包还没有解压，或只把 zip 文件放进了目录；请把迁移包内的 `journal-import-manifest.json`、`entries/` 和 `assets/` 放在 `JOURNAL_IMPORT_PATH` 对应目录的根部，再点击导入。

v1.2.9 兼容极空间本机转发端口动态变化：`127.0.0.1`/`localhost` 的任意端口都会被识别为本机远程访问来源，手机登录不再受临时端口变化影响。

v1.4.0 在 v1.3.0 的手机端优化基础上，继续修正手帐日期与快速切换的并发问题，完善日历日视图、拖动预览和乐观更新，统一登录 Cookie 有效期，并加入更新前备份保留策略与镜像发布质量检查。

v1.4.2 精简手帐为“时光流”和“翻页看”两种视图；修复纵轴快速拖动后详情可能停留在加载状态的问题，并为翻页视图增加左右滑动、方向键和上下篇按钮。

v1.5.0 移除首页大标题区，改为可直达提醒页的极简即时提醒；提醒会聚合下一项日程、手帐更新、新任务和协作通知。日历订阅、新建日程与月/周/日切换统一收进工具栏，同时为公开手帐更新和新任务发布补齐站内通知。

v1.5.1 移除“我们”个人资料页及桌面端、手机端和工作台中的对应入口，手机底栏收紧为日历、手帐、大厅、提醒四项。

v1.6.0 为首页日历增加日、三日、周、月四种视图；三日视图从当前选中日期开始连续展示，支持按三天翻页、时间轴新建和拖动改期。

v1.6.1 支持点击时光流中的手帐卡片直接进入对应的翻页阅读视图，同时保留历史轴定位与编辑按钮的独立操作。

v1.7.0 将手帐回应改为正文内批注：在翻页视图长按任意正文段落即可快速评论，评论会保存在对应段落下方；已有未定位的旧评论会无损归入正文末段。

v1.7.1 将手帐编辑器收紧为类型、标题、日期和正文四项，移除评分、分类、标签及“仅自己可见”设置；已有历史元数据继续保留。

v1.8.0 为日、三日、周时间轴中的个人日程增加上下边缘拖拽调整时长，支持 15 分钟吸附、最短时长保护、即时预览及键盘操作；整块拖动改期保持不变。

v1.7.2 将手帐模块统一为单一内容类型，移除“全部 / 手帐 / 点评”筛选和新建时的类型切换；历史点评继续保留，但统一按手帐展示。

## 本地开发

要求 Node.js 24、pnpm 11 和 Docker：

```bash
cp .env.example .env
pnpm install
docker compose -f compose.yaml -f compose.dev.yaml up -d db
```

本机运行 API 时，将当前 Shell 的 `DATABASE_URL` 临时改为 `postgresql://task_platform:<密码>@127.0.0.1:5432/task_platform`，然后：

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

开发 seed 账号：

- `admin@example.test`
- `publisher@example.test`
- `worker@example.test`

密码来自 `.env` 的 `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD`。生产环境有硬性保护，禁止执行开发 seed。

## 测试和质量检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

并发集成测试需要一个可丢弃的测试数据库：

```bash
TEST_DATABASE_URL=postgresql://task_platform:<密码>@127.0.0.1:5432/task_platform_test \
  pnpm --filter @task-platform/api test:integration
```

测试会创建并清理自己的 UUID 记录。不要把 `TEST_DATABASE_URL` 指向生产数据库。

完整 Playwright 流程要求 Compose 已启动：

```bash
pnpm --filter @task-platform/web exec playwright install chromium
E2E_BASE_URL=http://127.0.0.1:8080 pnpm test:e2e
```

覆盖流程：用户 A 注册和发布 → 用户 B 注册、接取和提交 → 用户 A 退回 → 用户 B 再提交 → 用户 A 验收。

## 备份

备份脚本调用容器内 `pg_dump`，同时归档上传文件、原始 Markdown、镜像版本、应用 Git 版本和 SHA-256 校验值：

```bash
./infrastructure/scripts/backup.sh
```

产物位于 `${BACKUP_DATA_PATH}/UTC时间戳/`：

```text
database.dump
uploads.tar.gz
journal-import.tar.gz
images.txt
app-version.txt
SHA256SUMS
```

默认自动清理超过 30 天的旧备份；可通过 `BACKUP_RETENTION_DAYS` 调整，设为 `0` 表示永久保留。清理范围只匹配备份目录下形如 `20260811T030000Z` 的时间戳目录。

定时备份示例（NAS 任务计划或 cron）：

```cron
20 3 * * * cd /volume1/docker/task-platform/deploy && ./infrastructure/scripts/backup.sh >> /var/log/task-platform-backup.log 2>&1
```

应定期把备份复制到另一台设备或异地存储，并实际演练恢复。NAS 快照无法替代 PostgreSQL 逻辑备份：快照可能捕获到事务中间状态，也无法单独验证逻辑对象。

## 恢复

恢复会停止 Web/API 写入、校验哈希、清理并恢复数据库对象：

```bash
./infrastructure/scripts/restore.sh /volume1/docker/task-platform/data/backups/20260729T030000Z
```

输入 `RESTORE` 确认。数据库恢复后：

1. 脚本会同时恢复 `uploads.tar.gz` 和 `journal-import.tar.gz`；再核对 NAS 目录权限。
2. 访问 `/api/v1/health`。
3. 检查用户数、近期任务、指派和成果。
4. 查看 `docker compose logs api db`，确认无迁移或权限错误。

## 升级

NAS 生产环境只升级镜像，不拉取源码、不执行 `docker compose build`：

```bash
# 先在 .env 中把 PROXY_IMAGE、WEB_IMAGE、API_IMAGE 改为同一新版本
./infrastructure/scripts/update.sh
docker compose ps
```

不要删除 NAS 的三个持久化目录或修改已有 migration。数据库迁移由 API 镜像启动时串行执行；多节点部署时应改为独立 migration job。

## 上传限制

默认允许 `jpg/jpeg/png/webp/pdf/docx/xlsx/txt/zip`，单文件 20 MB，每类对象最多 10 个文件。通过 `MAX_UPLOAD_SIZE_MB` 和 `MAX_FILES_PER_REQUEST` 调整。磁盘文件名为 UUID，数据库保留原始文件名，下载时重新执行任务参与者/发布者/管理员权限检查。

当前 Web 界面展示任务附件；任务、申请、成果附件的上传和下载接口均已实现。第一版的申请/成果附件选择器保持为 API 能力，适合后续在对应申请和提交组件中加入批量上传进度。

## 邮箱与密码恢复

第一版不依赖 SMTP，不发送验证或找回邮件。账号所有者可以在已登录状态修改密码；遗失密码时由管理员确认身份后，通过受控运维流程重置。不要直接在 SQL 中保存明文密码，管理员重置脚本应使用与 `create-admin.ts` 相同的 Argon2id 参数。

## 已知边界与后续建议

- 不含在线支付、资金托管、即时聊天、WebSocket、地图、实名认证、原生 App 或小程序。
- 奖励履约状态已建模，但第一版不自动结算。
- 多接取者任务当前按任务级状态展示；若未来要求每位接取者独立多轮验收，可把 UI 状态进一步细化到 assignment 维度。
- 本地文件存储通过 `StorageService` 隔离；扩展到 S3/MinIO 时应保留受控下载和权限检查。
- 上线前建议接入集中日志、病毒扫描、SMTP 邮件验证、备份告警以及边界代理的 TLS/HSTS。
