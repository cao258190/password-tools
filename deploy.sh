#!/usr/bin/env sh
set -eu

env_file=".env.docker"

app_version() {
  node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "0.0.0"
}

app_commit() {
  git rev-parse HEAD 2>/dev/null || echo ""
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

if [ ! -f "$env_file" ]; then
  cat > "$env_file" <<EOF
CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:3910}
COOKIE_SECURE=${COOKIE_SECURE:-false}
JWT_SECRET=$(random_secret)
SERVER_CRYPTO_SECRET=$(random_secret)
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-$(random_secret)}
REGISTRATION_ENABLED=${REGISTRATION_ENABLED:-false}
GITHUB_OWNER=${GITHUB_OWNER:-cao258190}
GITHUB_REPO=${GITHUB_REPO:-password-tools}
UPDATE_CHECK_REF=${UPDATE_CHECK_REF:-master}
WEB_UPDATE_ENABLED=${WEB_UPDATE_ENABLED:-true}
UPDATE_COMMAND=${UPDATE_COMMAND:-sh scripts/docker-web-update.sh}
UPDATE_PROJECT_DIR=${UPDATE_PROJECT_DIR:-/workspace/password-tools}
UPDATE_ENV_FILE=${UPDATE_ENV_FILE:-.env.docker}
UPDATE_COMPOSE_FILE=${UPDATE_COMPOSE_FILE:-docker-compose.yml}
EOF
  echo "Created $env_file with generated secrets."
  echo "Default admin email: $(grep '^ADMIN_EMAIL=' "$env_file" | cut -d= -f2-)"
  echo "Default admin password: $(grep '^ADMIN_PASSWORD=' "$env_file" | cut -d= -f2-)"
fi

export APP_VERSION="${APP_VERSION:-$(app_version)}"
export APP_COMMIT="${APP_COMMIT:-$(app_commit)}"

docker compose --env-file "$env_file" up -d --build
docker compose --env-file "$env_file" ps

echo ""
echo "Frontend: http://<server-ip>:3910"
echo "Backend health: http://<server-ip>:2697/api/health"
