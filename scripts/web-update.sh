#!/usr/bin/env sh
set -eu

branch="${UPDATE_CHECK_REF:-master}"

git fetch origin "$branch" --tags
git pull --ff-only origin "$branch"
npm ci
npx prisma generate
npm run build
node scripts/init-db.mjs

echo "Update finished. Restart the Node process if your process manager did not restart it automatically."
