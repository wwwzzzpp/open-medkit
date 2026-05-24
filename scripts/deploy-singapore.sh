#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-43.119.88.83}"
SERVER_USER="${SERVER_USER:-root}"
DOMAIN="${DOMAIN:-bank-t.chuya.wang}"
REPO_URL="${REPO_URL:-https://github.com/wwwzzzpp/open-medkit.git}"
BRANCH="${BRANCH:-$(git branch --show-current 2>/dev/null || true)}"
APP_DIR="${APP_DIR:-/opt/open-medkit}"
MEDKIT_PORT="${MEDKIT_PORT:-3000}"
AI_BASE_URL="${AI_BASE_URL:-https://api.deepseek.com}"
AI_MODEL="${AI_MODEL:-deepseek-chat}"
AI_API_KEY="${AI_API_KEY:-}"
AUTH_PASSWORD="${AUTH_PASSWORD:-}"
ENABLE_HTTPS="${ENABLE_HTTPS:-1}"
SWAP_SIZE="${SWAP_SIZE:-1G}"

if [[ -z "$BRANCH" ]]; then
  BRANCH="codex/agrochemical-inventory-management"
fi

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

escape_compose_env() {
  printf '%s' "$1" | sed 's/\$/$$/g'
}

need_cmd ssh
need_cmd scp
need_cmd npm
need_cmd openssl

GENERATED_PASSWORD=0
if [[ -z "$AUTH_PASSWORD" ]]; then
  AUTH_PASSWORD="$(openssl rand -hex 10)"
  GENERATED_PASSWORD=1
fi

echo "Generating password hash locally..."
AUTH_PASSWORD_HASH="$(
  npm run --silent hash-password -w backend -- "$AUTH_PASSWORD" |
    awk 'NF { line = $0 } END { print line }'
)"

if [[ "$AUTH_PASSWORD_HASH" != \$argon2id\$* ]]; then
  echo "Failed to generate AUTH_PASSWORD_HASH." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/open-medkit.env" <<EOF
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
AUTH_PASSWORD_HASH=$(escape_compose_env "$AUTH_PASSWORD_HASH")
AUTH_PASSWORD=
AI_API_KEY=$(escape_compose_env "$AI_API_KEY")
AI_BASE_URL=$(escape_compose_env "$AI_BASE_URL")
AI_MODEL=$(escape_compose_env "$AI_MODEL")
MEDKIT_PORT=$MEDKIT_PORT
NO_PROXY=localhost,127.0.0.1,.local
EOF

cat >"$TMP_DIR/deploy-remote.sh" <<'REMOTE_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$1"
REPO_URL="$2"
BRANCH="$3"
DOMAIN="$4"
ENABLE_HTTPS="$5"
SWAP_SIZE="$6"

export DEBIAN_FRONTEND=noninteractive

disable_known_broken_nginx_site() {
  if command -v nginx >/dev/null 2>&1 && ! nginx -t >/tmp/open-medkit-nginx-test.log 2>&1; then
    mkdir -p /etc/nginx/sites-disabled
    for path in /etc/nginx/sites-enabled/api-test.chuya.wang*; do
      [ -e "$path" ] || continue
      mv "$path" "/etc/nginx/sites-disabled/$(basename "$path").disabled-$(date +%Y%m%d%H%M%S)"
    done
  fi
}

ensure_swap() {
  local mem_kb
  mem_kb="$(awk '/MemTotal/ { print $2 }' /proc/meminfo)"
  if [ "${mem_kb:-0}" -lt 2000000 ] && ! swapon --show | grep -q .; then
    fallocate -l "$SWAP_SIZE" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
}

install_packages() {
  disable_known_broken_nginx_site
  apt-get update
  apt-get install -y git curl docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
  dpkg --configure -a
  systemctl enable --now docker
  systemctl enable --now nginx
}

sync_code() {
  if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    git remote set-url origin "$REPO_URL"
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull --ff-only origin "$BRANCH"
  else
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
  fi

  cat > docker-compose.prod.yml <<'EOF'
services:
  medkit:
    ports: !override
      - "127.0.0.1:${MEDKIT_PORT:-3000}:3000"
EOF

  install -m 600 /tmp/open-medkit.env "$APP_DIR/.env"
  rm -f /tmp/open-medkit.env
}

configure_nginx() {
  disable_known_broken_nginx_site

  cat >"/etc/nginx/sites-available/$DOMAIN" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }
}
EOF

  ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
  nginx -t
  systemctl reload nginx
}

start_app() {
  cd "$APP_DIR"
  docker compose up -d --build

  for _ in $(seq 1 40); do
    if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
      return 0
    fi
    sleep 3
  done

  docker compose ps
  docker compose logs --tail=120 medkit
  echo "Application did not become healthy in time." >&2
  return 1
}

HTTPS_READY=0

enable_https() {
  if [ "$ENABLE_HTTPS" != "1" ]; then
    return 0
  fi

  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
    nginx -t
    systemctl reload nginx
    HTTPS_READY=1
  else
    echo "HTTPS certificate setup failed. HTTP is still configured; check DNS and retry." >&2
  fi
}

ensure_swap
install_packages
sync_code
configure_nginx
start_app
enable_https

cd "$APP_DIR"
docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
if [ "$ENABLE_HTTPS" = "1" ] && [ "$HTTPS_READY" = "1" ]; then
  curl -fsS "https://$DOMAIN/api/health"
fi
REMOTE_SCRIPT

chmod +x "$TMP_DIR/deploy-remote.sh"

echo "Uploading deployment files to $SERVER_USER@$SERVER_HOST..."
scp "$TMP_DIR/open-medkit.env" "$TMP_DIR/deploy-remote.sh" "$SERVER_USER@$SERVER_HOST:/tmp/"

echo "Deploying $REPO_URL#$BRANCH to $SERVER_HOST..."
ssh "$SERVER_USER@$SERVER_HOST" \
  "bash /tmp/deploy-remote.sh '$APP_DIR' '$REPO_URL' '$BRANCH' '$DOMAIN' '$ENABLE_HTTPS' '$SWAP_SIZE'"

cat <<EOF

Deployment complete.
URL: https://$DOMAIN
Server: $SERVER_USER@$SERVER_HOST
App directory: $APP_DIR

Access password:
$AUTH_PASSWORD
EOF

if [[ "$GENERATED_PASSWORD" = "1" ]]; then
  cat <<'EOF'

This password was generated for this deployment. Store it in your password manager.
To reset it later, run this script again with AUTH_PASSWORD set.
EOF
fi
