#!/usr/bin/env sh
set -eu

branch="${UPDATE_CHECK_REF:-master}"
target_version="${TARGET_VERSION:-}"
project_dir="${UPDATE_PROJECT_DIR:-/workspace/password-tools}"
host_project_dir="${UPDATE_HOST_PROJECT_DIR:-}"
env_file="${UPDATE_ENV_FILE:-.env.docker}"
compose_file="${UPDATE_COMPOSE_FILE:-docker-compose.yml}"
status_file="${UPDATE_STATUS_FILE:-$project_dir/.update-status.json}"
updater_name="${UPDATE_CONTAINER_NAME:-password-tools-updater}"
api_image="${API_IMAGE:-ghcr.io/cao258190/password-tools-api}"
app_version="${APP_VERSION:-latest}"
updater_image="${UPDATE_RUNNER_IMAGE:-$api_image:$app_version}"

if [ -n "${UPDATE_JOB_FILE:-}" ]; then
  exec sh scripts/request-docker-update.sh
fi

if [ -z "$host_project_dir" ]; then
  echo "未配置 UPDATE_HOST_PROJECT_DIR，Docker Web 更新无法定位宿主机项目目录。" >&2
  exit 1
fi

if [ ! -d "$project_dir/.git" ]; then
  echo "更新目录不是 Git 仓库：$project_dir" >&2
  exit 1
fi

if [ ! -S /var/run/docker.sock ]; then
  echo "容器未挂载 /var/run/docker.sock，无法更新 Docker 服务。" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "容器内不可用 docker compose，请确认 API 镜像已安装 Docker Compose 插件。" >&2
  exit 1
fi

run_updater() {
  docker rm -f "$updater_name" >/dev/null 2>&1 || true
  docker run -d \
    --name "$updater_name" \
    --restart no \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$host_project_dir":"$project_dir" \
    -w "$project_dir" \
    -e API_IMAGE="${API_IMAGE:-ghcr.io/cao258190/password-tools-api}" \
    -e WEB_IMAGE="${WEB_IMAGE:-ghcr.io/cao258190/password-tools-web}" \
    -e DOCKER_PULL_POLICY="${DOCKER_PULL_POLICY:-prefer}" \
    -e TARGET_VERSION="$target_version" \
    -e UPDATE_CHECK_REF="$branch" \
    -e UPDATE_ENV_FILE="$env_file" \
    -e UPDATE_COMPOSE_FILE="$compose_file" \
    -e UPDATE_STATUS_FILE="$status_file" \
    "$1" \
    sh scripts/docker-web-update-worker.sh
}

if ! run_updater "$updater_image"; then
  echo "预构建更新容器不可用，尝试使用本地 API 镜像启动更新容器。" >&2
  run_updater "password-tools-api:latest"
fi

echo "更新后台容器已启动：$updater_name"
