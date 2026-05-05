#!/usr/bin/env sh
set -eu

branch="${UPDATE_CHECK_REF:-master}"
env_file="${UPDATE_ENV_FILE:-.env.docker}"
compose_file="${UPDATE_COMPOSE_FILE:-docker-compose.yml}"
status_file="${UPDATE_STATUS_FILE:-.update-status.json}"

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
  "output": "$(json_escape "$output")"
}
EOF_STATUS
}

run_update() {
  git fetch origin "$branch" --tags
  git pull --ff-only origin "$branch"

  app_version="$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "0.0.0")"
  app_commit="$(git rev-parse HEAD)"
  export APP_VERSION="${APP_VERSION:-$app_version}"
  export APP_COMMIT="${APP_COMMIT:-$app_commit}"

  docker compose --env-file "$env_file" -f "$compose_file" up -d --build
  echo "Docker 服务已更新到 $app_commit"
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
