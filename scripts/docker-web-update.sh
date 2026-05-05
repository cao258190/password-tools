#!/usr/bin/env sh
set -eu

branch="${UPDATE_CHECK_REF:-master}"
project_dir="${UPDATE_PROJECT_DIR:-/workspace/password-tools}"
env_file="${UPDATE_ENV_FILE:-.env.docker}"
compose_file="${UPDATE_COMPOSE_FILE:-docker-compose.yml}"

if [ ! -d "$project_dir/.git" ]; then
  echo "更新目录不是 Git 仓库：$project_dir" >&2
  exit 1
fi

if [ ! -S /var/run/docker.sock ]; then
  echo "容器未挂载 /var/run/docker.sock，无法重建 Docker 服务。" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "容器内不可用 docker compose，请确认镜像安装了 Docker Compose 插件。" >&2
  exit 1
fi

cd "$project_dir"

git fetch origin "$branch" --tags
git pull --ff-only origin "$branch"

export APP_VERSION="${APP_VERSION:-$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "0.0.0")}"
export APP_COMMIT="${APP_COMMIT:-$(git rev-parse HEAD)}"

docker compose --env-file "$env_file" -f "$compose_file" up -d --build

echo "Docker 服务已更新到 $APP_COMMIT"
