#!/usr/bin/env sh
set -eu

env_file=".env.docker"
host_project_dir="$(pwd)"

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
UPDATE_HOST_PROJECT_DIR=${UPDATE_HOST_PROJECT_DIR:-$host_project_dir}
UPDATE_ENV_FILE=${UPDATE_ENV_FILE:-.env.docker}
UPDATE_COMPOSE_FILE=${UPDATE_COMPOSE_FILE:-docker-compose.yml}
UPDATE_DETACHED=${UPDATE_DETACHED:-true}
UPDATE_STATUS_FILE=${UPDATE_STATUS_FILE:-/workspace/password-tools/.update-status.json}
API_IMAGE=${API_IMAGE:-ghcr.io/cao258190/password-tools-api}
WEB_IMAGE=${WEB_IMAGE:-ghcr.io/cao258190/password-tools-web}
DOCKER_PULL_POLICY=${DOCKER_PULL_POLICY:-prefer}
EOF
  echo "Created $env_file with generated secrets."
  echo "Default admin email: $(grep '^ADMIN_EMAIL=' "$env_file" | cut -d= -f2-)"
  echo "Default admin password: $(grep '^ADMIN_PASSWORD=' "$env_file" | cut -d= -f2-)"
fi

if ! grep -q '^UPDATE_HOST_PROJECT_DIR=' "$env_file"; then
  printf '\nUPDATE_HOST_PROJECT_DIR=%s\n' "$host_project_dir" >> "$env_file"
fi

if ! grep -q '^UPDATE_DETACHED=' "$env_file"; then
  printf 'UPDATE_DETACHED=true\n' >> "$env_file"
fi

if ! grep -q '^UPDATE_STATUS_FILE=' "$env_file"; then
  printf 'UPDATE_STATUS_FILE=/workspace/password-tools/.update-status.json\n' >> "$env_file"
fi

if ! grep -q '^API_IMAGE=' "$env_file"; then
  printf 'API_IMAGE=ghcr.io/cao258190/password-tools-api\n' >> "$env_file"
fi

if ! grep -q '^WEB_IMAGE=' "$env_file"; then
  printf 'WEB_IMAGE=ghcr.io/cao258190/password-tools-web\n' >> "$env_file"
fi

if ! grep -q '^DOCKER_PULL_POLICY=' "$env_file"; then
  printf 'DOCKER_PULL_POLICY=prefer\n' >> "$env_file"
fi

export APP_VERSION="${APP_VERSION:-$(app_version)}"
export APP_COMMIT="${APP_COMMIT:-$(app_commit)}"

pull_policy="$(grep '^DOCKER_PULL_POLICY=' "$env_file" | cut -d= -f2- || true)"
pull_policy="${pull_policy:-prefer}"

if [ "$pull_policy" = "never" ]; then
  docker compose --env-file "$env_file" up -d --build
elif docker compose --env-file "$env_file" pull; then
  docker compose --env-file "$env_file" up -d --no-build
else
  echo "Prebuilt images are unavailable, falling back to local build."
  docker compose --env-file "$env_file" up -d --build
fi
docker compose --env-file "$env_file" ps

echo ""
echo "Frontend: http://<server-ip>:3910"
echo "Backend health: http://<server-ip>:2697/api/health"
