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

首次部署会自动初始化 SQLite 表结构和固定分类字典，网站与账号数据为空。请在页面里注册新账号开始使用，数据会持久化到 Docker volume。

## 环境变量

首次执行 `deploy.sh` 会自动生成 `.env.docker`，包含随机 `JWT_SECRET` 与 `SERVER_CRYPTO_SECRET`。

如果部署在域名或 HTTPS 后面，请修改 `.env.docker`：

```env
CORS_ORIGIN=https://your-domain.com
COOKIE_SECURE=true
```

如果只是通过 `http://服务器IP:3910` 访问，保持：

```env
COOKIE_SECURE=false
```

## 常用命令

```bash
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker logs -f
docker compose --env-file .env.docker down
```

SQLite 数据保存在 Docker volume `password-tools_password_tools_data` 中。删除 volume 会清空数据。
