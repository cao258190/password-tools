#!/usr/bin/env sh
set -eu

branch="${UPDATE_CHECK_REF:-master}"
target_version="${TARGET_VERSION:-}"

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
npm ci
npx prisma generate
npm run build
node scripts/init-db.mjs

echo "更新完成。如果进程管理器没有自动重启 Node 服务，请手动重启。"
