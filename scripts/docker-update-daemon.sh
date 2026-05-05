#!/usr/bin/env sh
set -eu

job_file="${UPDATE_JOB_FILE:-/app/update-state/update-job.json}"
poll_interval="${UPDATE_POLL_INTERVAL:-3}"
processing_file="$job_file.processing"

mkdir -p "$(dirname "$job_file")"
echo "Docker 更新守护进程已启动，等待 Web 更新任务。"

while :; do
  if [ -f "$job_file" ] && mv "$job_file" "$processing_file" 2>/dev/null; then
    target_version="$(
      node -e "const fs = require('fs'); const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(data.targetVersion || '');" "$processing_file"
    )"
    rm -f "$processing_file"

    if TARGET_VERSION="$target_version" sh scripts/docker-web-update-worker.sh; then
      :
    else
      echo "Docker 更新任务执行失败，请查看状态文件或容器日志。" >&2
    fi
  fi

  sleep "$poll_interval"
done
