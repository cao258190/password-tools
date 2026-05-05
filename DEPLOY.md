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

管理员可在“保险库设置”中检测 GitHub 最新 Release；如果仓库没有 Release，会回退检测 `UPDATE_CHECK_REF` 分支最新提交。

Web 在线更新默认开启，首次生成的 `.env.docker` 会写入：

```env
WEB_UPDATE_ENABLED=true
UPDATE_COMMAND="sh scripts/docker-web-update.sh"
UPDATE_PROJECT_DIR=/workspace/password-tools
UPDATE_ENV_FILE=.env.docker
UPDATE_COMPOSE_FILE=docker-compose.yml
```

`UPDATE_COMMAND` 只由服务器环境变量提供，页面不能传入任意命令。Docker Compose 默认命令会在挂载的项目目录中执行 `git pull --ff-only`，然后通过挂载的 `/var/run/docker.sock` 执行 `docker compose --env-file .env.docker up -d --build`，重建前端与后端容器。

为了支持 Docker Web 更新，`api` 容器会挂载：

- 当前项目目录：`.:/workspace/password-tools`
- Docker socket：`/var/run/docker.sock:/var/run/docker.sock`

这意味着管理员点击“立即更新”后，后端容器有权限控制宿主机 Docker。若你不希望 Web 页面具备这项能力，请在 `.env.docker` 中设置：

```env
WEB_UPDATE_ENABLED=false
```

如果使用非标准项目路径或 compose 文件名，请调整 `UPDATE_PROJECT_DIR`、`UPDATE_ENV_FILE` 和 `UPDATE_COMPOSE_FILE`。

## 常用命令

```bash
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker logs -f
docker compose --env-file .env.docker down
```

SQLite 数据保存在 Docker volume `password-tools_password_tools_data` 中。删除 volume 会清空数据。
