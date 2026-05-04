#!/usr/bin/env sh
set -eu

env_file=".env.docker"

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
EOF
  echo "Created $env_file with generated secrets."
  echo "Default admin email: $(grep '^ADMIN_EMAIL=' "$env_file" | cut -d= -f2-)"
  echo "Default admin password: $(grep '^ADMIN_PASSWORD=' "$env_file" | cut -d= -f2-)"
fi

docker compose --env-file "$env_file" up -d --build
docker compose --env-file "$env_file" ps

echo ""
echo "Frontend: http://<server-ip>:3910"
echo "Backend health: http://<server-ip>:2697/api/health"
