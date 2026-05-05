#!/usr/bin/env sh
set -eu

branch="${UPDATE_CHECK_REF:-master}"
target_version="${TARGET_VERSION:-}"
env_file="${UPDATE_ENV_FILE:-.env.docker}"
compose_file="${UPDATE_COMPOSE_FILE:-docker-compose.yml}"
status_file="${UPDATE_STATUS_FILE:-.update-status.json}"

normalized_target_version() {
  if [ -z "$target_version" ]; then
    return
  fi
  case "$target_version" in
    v*) printf '%s' "$target_version" ;;
    *) printf 'v%s' "$target_version" ;;
  esac
}

json_escape() {
  node -e "process.stdout.write(JSON.stringify(process.argv[1] || '').slice(1, -1))" "$1"
}

write_status() {
  status="$1"
  message="$2"
  output="${3:-}"
  finished_at="${4:-}"
  started_at="$(node -e "try { const fs = require('fs'); const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(data.startedAt || new Date().toISOString()); } catch { console.log(new Date().toISOString()); }" "$status_file")"
  mkdir -p "$(dirname "$status_file")"
  cat > "$status_file" <<EOF_STATUS
{
  "status": "$(json_escape "$status")",
  "startedAt": "$(json_escape "$started_at")",
  "finishedAt": $(if [ -n "$finished_at" ]; then printf '"%s"' "$(json_escape "$finished_at")"; else printf 'null'; fi),
  "message": "$(json_escape "$message")",
  "output": "$(json_escape "$output")",
  "targetVersion": $(if [ -n "$target_version" ]; then printf '"%s"' "$(json_escape "$(normalized_target_version)")"; else printf 'null'; fi)
}
EOF_STATUS
}

compose_up() {
  pull_policy="${DOCKER_PULL_POLICY:-prefer}"
  if [ "$pull_policy" = "never" ]; then
    docker compose --env-file "$env_file" -f "$compose_file" up -d --build
    return
  fi

  if docker compose --env-file "$env_file" -f "$compose_file" pull; then
    docker compose --env-file "$env_file" -f "$compose_file" up -d --no-build
  else
    echo "预构建镜像不可用，回退到服务器本地构建。"
    docker compose --env-file "$env_file" -f "$compose_file" up -d --build
  fi
}

run_update() {
  git fetch origin "$branch" --tags

  if [ -n "$target_version" ]; then
    case "$target_version" in
      v[0-9]*.[0-9]*.[0-9]* | [0-9]*.[0-9]*.[0-9]*)
        ;;
      *)
        echo "目标版本格式无效：$target_version" >&2
        exit 1
        ;;
    esac

    tag="$target_version"
    case "$tag" in
      v*) ;;
      *) tag="v$tag" ;;
    esac
    git checkout --force "$tag"
  else
    git checkout --force "$branch"
    git pull --ff-only origin "$branch"
  fi

  app_version="$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "0.0.0")"
  app_commit="$(git rev-parse HEAD)"
  export APP_VERSION="$app_version"
  export APP_COMMIT="$app_commit"

  compose_up
  echo "Docker 服务已更新到 $app_commit，版本 $app_version。"
}

write_status "running" "更新后台容器正在执行" ""

log_file="$(mktemp)"
if run_update >"$log_file" 2>&1; then
  output="$(tail -c 5000 "$log_file")"
  write_status "success" "更新完成" "$output" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
else
  output="$(tail -c 5000 "$log_file")"
  write_status "failed" "更新失败，请查看日志" "$output" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  cat "$log_file" >&2
  rm -f "$log_file"
  exit 1
fi

rm -f "$log_file"
