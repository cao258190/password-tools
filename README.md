# Password Tools

一个本地可运行、支持 Docker 部署的密码管理器原型。项目包含 Vue 3 前端、Express 后端、SQLite 数据库和 Prisma 数据模型，界面复刻暗色/浅色桌面密码库体验。

## 功能概览

- 用户注册、登录、退出、个人信息修改、密码修改
- 初始化默认管理员账号，管理员可控制是否开放新用户注册
- 网站管理：新增、编辑、删除、收藏、分类、标签、备注、备用网址
- 账号管理：多账号、密码显示/隐藏、复制、生成、强度展示、删除确认
- 搜索筛选：按网站名、账号、标签、备注搜索，支持分类和收藏筛选
- 全局固定分类：所有用户共用同一套分类字典，网站和账号数据按用户隔离
- 安全处理：用户密码使用 `bcryptjs` 哈希；账号密码使用服务端密钥派生后 `AES-256-GCM` 加密存储
- 请求防护：写操作使用 CSRF 双提交校验，登录和注册接口有基础限流，服务端返回安全响应头
- 版本更新：管理员可在设置中检测 GitHub 最新版本，并在服务器开启后通过 Web 触发预配置更新命令
- Docker 一键部署：前端端口 `3910`，后端端口 `2697`

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router、lucide-vue-next
- 后端：Express、TypeScript、Prisma、SQLite、Zod
- 测试：Vitest、Supertest、Vue Test Utils
- 部署：Docker、Docker Compose、Nginx

## 目录结构

```text
.
├── src/client          # Vue 前端
├── src/server          # Express 后端
├── prisma              # Prisma schema 和种子数据
├── scripts             # 数据库初始化、视觉检查脚本
├── tests               # 前后端测试
├── docker              # Nginx 配置
├── Dockerfile.api      # 后端镜像
├── Dockerfile.web      # 前端镜像
├── docker-compose.yml  # 一键部署编排
└── DEPLOY.md           # Docker 部署说明
```

## 本地开发

安装依赖：

```bash
npm install
```

准备环境变量：

```bash
cp .env.example .env
```

初始化数据库和固定分类：

```bash
npm run db:generate
npm run db:push
```

首次初始化会创建默认管理员：

- 邮箱：`.env` 中的 `ADMIN_EMAIL`，未配置时为 `admin@example.com`
- 密码：`.env` 中的 `ADMIN_PASSWORD`，未配置时为 `admin123456`

新用户注册默认关闭。管理员登录后可在“保险库设置”里开启或关闭注册入口。

启动前后端开发服务：

```bash
npm run dev
```

默认访问地址：

- 前端：`http://localhost:5173`
- 后端：`.env` 中的 `PORT`，当前默认通常为 `http://localhost:3001`

## 数据库与示例数据

初始化空库：

```bash
npm run db:push
```

重置并写入演示数据：

```bash
npm run db:reset
```

演示账号来自 `prisma/seed.ts` 和 `src/server/services/demoData.ts`。SQLite 文件默认位于 `prisma/dev.db`，已被 `.gitignore` 排除。

## 常用脚本

```bash
npm run dev           # 同时启动前端和后端开发服务
npm run dev:client    # 只启动前端
npm run dev:server    # 只启动后端
npm run build         # 构建前端和后端
npm run start         # 运行构建后的后端
npm test              # 运行测试
npm run visual:check  # 生成多尺寸视觉检查截图
```

## Docker 部署

服务器需要 Docker 与 Docker Compose 插件。

```bash
chmod +x deploy.sh
./deploy.sh
```

部署后：

- 前端：`http://服务器IP:3910`
- 后端健康检查：`http://服务器IP:2697/api/health`

首次部署会自动初始化 SQLite 表结构和固定分类字典。详细说明见 `DEPLOY.md`。

## API 摘要

- `POST /api/auth/register`：注册
- `POST /api/auth/login`：登录
- `POST /api/auth/logout`：退出
- `GET /api/auth/me`：当前用户
- `PATCH /api/auth/profile`：修改个人信息
- `PATCH /api/auth/password`：修改密码
- `GET /api/public/settings`：公开系统设置
- `GET /api/admin/settings`：管理员设置
- `PATCH /api/admin/settings`：修改管理员设置
- `GET /api/admin/version`：管理员检测 GitHub 版本
- `GET /api/admin/update`：管理员查看 Web 更新任务状态
- `POST /api/admin/update`：管理员触发服务器预配置更新命令
- `GET /api/admin/backup/export`：管理员导出全系统备份
- `POST /api/admin/backup/import`：管理员导入全系统备份并覆盖当前数据
- `GET /api/categories`：全局固定分类和当前用户计数
- `GET /api/sites`：网站列表
- `POST /api/sites`：新增网站
- `GET /api/sites/:id`：网站详情
- `PATCH /api/sites/:id`：编辑网站
- `DELETE /api/sites/:id`：删除网站
- `POST /api/sites/:id/accounts`：新增账号
- `PATCH /api/accounts/:id`：编辑账号
- `DELETE /api/accounts/:id`：删除账号
- `GET /api/tags`：标签统计
- `GET /api/stats`：安全统计
- `POST /api/password/generate`：生成密码

## 安全说明

这是一个本地可运行的完整原型，不等同于经过安全审计的生产级密码管理器。当前采用服务端托管加密模式：服务端会在认证通过后解密账号密码并返回给当前用户。若需要“服务端永不接触明文”的零知识架构，需要改为前端 Web Crypto 加解密，并重新设计密钥恢复与多设备同步方案。

部署到公网前请务必：

- 修改 `JWT_SECRET` 和 `SERVER_CRYPTO_SECRET`
- 修改 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`，首次登录后尽快修改管理员密码
- 使用 HTTPS，并在 HTTPS 环境设置 `COOKIE_SECURE=true`
- 妥善备份 SQLite volume
- 限制服务器访问权限并定期更新镜像
- Web 在线更新默认开启；Docker 部署由独立 updater 服务挂载 Docker socket 并重建 compose 服务，不需要时请设置 `WEB_UPDATE_ENABLED=false`

生产环境启动时会检查 `JWT_SECRET`、`SERVER_CRYPTO_SECRET` 和 `ADMIN_PASSWORD`，如果仍是默认值或长度过短会拒绝启动。

管理员导出的系统备份包含用户密码哈希、账号密文字段和分类/网站/账号数据，不包含账号明文密码。账号密文依赖当前服务器的 `SERVER_CRYPTO_SECRET`，迁移或恢复到其他服务器时必须使用同一个 `SERVER_CRYPTO_SECRET`，否则账号密码无法解密。
