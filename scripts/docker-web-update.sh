#!/usr/bin/env sh
set -eu

branch="${UPDATE_CHECK_REF:-master}"
project_dir="${UPDATE_PROJECT_DIR:-/workspace/password-tools}"
host_project_dir="${UPDATE_HOST_PROJECT_DIR:-}"
env_file="${UPDATE_ENV_FILE:-.env.docker}"
compose_file="${UPDATE_COMPOSE_FILE:-docker-compose.yml}"
status_file="${UPDATE_STATUS_FILE:-$project_dir/.update-status.json}"
updater_name="${UPDATE_CONTAINER_NAME:-password-tools-updater}"

if [ -z "$host_project_dir" ]; then
  echo "未配置 UPDATE_HOST_PROJECT_DIR，Docker Web 更新无法定位宿主机项目目录。" >&2
  exit 1
fi

if [ ! -d "$project_dir/.git" ]; then
  echo "更新目录不是 Git 仓库：$project_dir" >&2
  exit 1
fi

if [ ! -S /var/run/docker.sock ]; then
  echo "容器未挂载 /var/run/docker.sock，无法重建 Docker 服务。" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "容器内不可用 docker compose，请确认 API 镜像已安装 Docker Compose 插件。" >&2
  exit 1
fi

docker rm -f "$updater_name" >/dev/null 2>&1 || true

docker run -d \
  --name "$updater_name" \
  --restart no \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$host_project_dir":"$project_dir" \
  -w "$project_dir" \
  -e UPDATE_CHECK_REF="$branch" \
  -e UPDATE_ENV_FILE="$env_file" \
  -e UPDATE_COMPOSE_FILE="$compose_file" \
  -e UPDATE_STATUS_FILE="$status_file" \
  password-tools-api:latest \
  sh scripts/docker-web-update-worker.sh

echo "更新后台容器已启动：$updater_name"
