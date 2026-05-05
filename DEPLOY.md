# Docker 部署

服务器需安装 Docker 与 Docker Compose 插件。

## 一键启动

```bash
chmod +x deploy.sh
./deploy.sh
```

启动后：

- 前端：`http://服务器IP:3910`
- 后端健康检查：`http://服务器IP:2697/api/health`

前端 Nginx 会把 `/api/*` 代理到后端容器，所以浏览器只访问 `3910` 也能完整使用系统。

首次部署会自动初始化 SQLite 表结构、固定分类字典和默认管理员账号，网站与账号数据为空。请使用管理员账号登录，再按需开启新用户注册。数据会持久化到 Docker volume。

## 环境变量

首次执行 `deploy.sh` 会自动生成 `.env.docker`，包含随机 `JWT_SECRET`、`SERVER_CRYPTO_SECRET` 与 `ADMIN_PASSWORD`。脚本会在终端输出默认管理员邮箱和密码，请妥善保存。

如果部署在域名或 HTTPS 后面，请修改 `.env.docker`：

```env
CORS_ORIGIN=https://your-domain.com
COOKIE_SECURE=true
```

如果只是通过 `http://服务器IP:3910` 访问，保持：

```env
COOKIE_SECURE=false
```

默认管理员配置：

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-before-deploy
REGISTRATION_ENABLED=false
```

`REGISTRATION_ENABLED=false` 表示首次部署后关闭普通注册入口，管理员可在应用设置中重新开启。

GitHub 版本检测配置：

```env
GITHUB_OWNER=cao258190
GITHUB_REPO=password-tools
UPDATE_CHECK_REF=master
```

管理员可在“保险库设置”中检测 GitHub 最新 Release 版本号，并从最近的 Release 列表中选择要更新到的目标版本；如果仓库没有 Release，会回退读取 `UPDATE_CHECK_REF` 分支 `package.json` 中的 `version` 字段。是否有新版本只按版本号比较，不按提交信息判断。

Web 在线更新默认开启，首次生成的 `.env.docker` 会写入：

```env
WEB_UPDATE_ENABLED=true
UPDATE_COMMAND="sh scripts/request-docker-update.sh"
UPDATE_PROJECT_DIR=/workspace/password-tools
UPDATE_HOST_PROJECT_DIR=/www/wwwroot/password-tools
UPDATE_ENV_FILE=.env.docker
UPDATE_COMPOSE_FILE=docker-compose.yml
UPDATE_DETACHED=true
UPDATE_STATUS_FILE=/app/update-state/update-status.json
UPDATE_JOB_FILE=/app/update-state/update-job.json
API_IMAGE=ghcr.io/cao258190/password-tools-api
WEB_IMAGE=ghcr.io/cao258190/password-tools-web
DOCKER_PULL_POLICY=prefer
```

`UPDATE_COMMAND` 只由服务器环境变量提供，页面不能传入任意命令。Docker Web 更新由 API 写入更新任务，独立的 `password-tools-updater` 服务负责读取任务并执行 Docker 操作。API 容器不挂载 Docker socket；只有 updater 服务挂载项目目录和 `/var/run/docker.sock`。如果页面选择了目标版本，updater 会 checkout 到对应 tag；未指定时会更新 `UPDATE_CHECK_REF` 分支。更新状态会写入共享状态卷，因此 API 容器被重建后页面仍能看到成功或失败结果。

默认部署会优先拉取 GitHub Container Registry 上的预构建镜像：

- `ghcr.io/cao258190/password-tools-api:<版本号>`
- `ghcr.io/cao258190/password-tools-web:<版本号>`

正常发布版本后，服务器只需要下载镜像并重启容器，不会再执行前端构建。若镜像暂时不可用，脚本会自动回退到服务器本地构建。需要强制本地构建时，可在 `.env.docker` 中设置：

```env
DOCKER_PULL_POLICY=never
```

为了支持 Docker Web 更新，`updater` 容器会挂载：

- 当前项目目录：`.:/workspace/password-tools`
- Docker socket：`/var/run/docker.sock:/var/run/docker.sock`

这意味着管理员点击“立即更新”后，updater 容器有权限控制宿主机 Docker。若你不希望 Web 页面具备这项能力，请在 `.env.docker` 中设置：

```env
WEB_UPDATE_ENABLED=false
```

如果使用非标准项目路径或 compose 文件名，请调整 `UPDATE_HOST_PROJECT_DIR`、`UPDATE_PROJECT_DIR`、`UPDATE_ENV_FILE` 和 `UPDATE_COMPOSE_FILE`。`UPDATE_HOST_PROJECT_DIR` 必须是宿主机真实路径，例如 `/www/wwwroot/password-tools`。

## 常用命令

```bash
docker compose --env-file .env.docker pull
docker compose --env-file .env.docker up -d --no-build
docker compose --env-file .env.docker logs -f
docker compose --env-file .env.docker down
```

SQLite 数据保存在 Docker volume `password-tools_password_tools_data` 中。删除 volume 会清空数据。
