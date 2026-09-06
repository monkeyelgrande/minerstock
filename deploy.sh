#!/bin/bash
# Deploy monorepo Laravel API + Angular SPA — Virtualmin sub-server.
#
# Ejecutar EN EL SERVIDOR:
#   cd ~/repos/<project> && bash deploy.sh
#
# O desde local:
#   ssh <user> "cd ~/repos/<project> && bash deploy.sh"
#
# === Para forkear como template a otro proyecto ===
# Cambiar solo las 3 variables del bloque "PROJECT CONFIG" abajo.

set -euo pipefail

# ---------- PROJECT CONFIG (override per fork) ----------
PROJECT_NAME="${PROJECT_NAME:-monkeystechnology}"
PROJECT_DOMAIN="${PROJECT_DOMAIN:-monkeystechnology.com}"
SMOKE_PATHS=("/" "/api/health")
# --------------------------------------------------------

export PATH="$HOME/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

REPO_DIR="$HOME/repos/$PROJECT_NAME"
API_DIR="$REPO_DIR/api"
WEB_DIR="$REPO_DIR/web"

echo "==> Pull desde GitHub"
cd "$REPO_DIR"
COMPOSER_LOCK_BEFORE=$(md5sum api/composer.lock 2>/dev/null | awk '{print $1}' || echo "")
NPM_LOCK_BEFORE=$(md5sum web/package-lock.json 2>/dev/null | awk '{print $1}' || echo "")
git pull --ff-only
COMPOSER_LOCK_AFTER=$(md5sum api/composer.lock 2>/dev/null | awk '{print $1}' || echo "")
NPM_LOCK_AFTER=$(md5sum web/package-lock.json 2>/dev/null | awk '{print $1}' || echo "")

# ---------- API ----------
cd "$API_DIR"

if [ "$COMPOSER_LOCK_BEFORE" != "$COMPOSER_LOCK_AFTER" ] || [ ! -d vendor ]; then
    echo "==> composer install (api/)"
    composer install --no-dev --optimize-autoloader --no-interaction
fi

# ---------- SPA ----------
cd "$WEB_DIR"

if [ "$NPM_LOCK_BEFORE" != "$NPM_LOCK_AFTER" ] || [ ! -d node_modules ]; then
    echo "==> npm ci (web/)"
    npm ci --no-audit --no-fund
fi

echo "==> ng build production"
npx ng build --configuration production

echo "==> Copiar dist Angular → api/public/"
# Angular 18+ usa dist/web/browser/ por default
DIST_SRC=""
if [ -d "$WEB_DIR/dist/web/browser" ]; then
    DIST_SRC="$WEB_DIR/dist/web/browser"
elif [ -d "$WEB_DIR/dist/web" ]; then
    DIST_SRC="$WEB_DIR/dist/web"
else
    echo "ERROR: no encontré dist de Angular en $WEB_DIR/dist/"
    exit 1
fi

# Limpiar archivos de SPA previos en api/public/ (sin tocar index.php, .htaccess, robots, favicon)
find "$API_DIR/public" -maxdepth 1 -type f \
    ! -name 'index.php' \
    ! -name '.htaccess' \
    ! -name 'robots.txt' \
    ! -name 'favicon.ico' \
    -delete 2>/dev/null || true
rm -rf "$API_DIR/public/assets" "$API_DIR/public/media" 2>/dev/null || true

# Copiar nueva build (cp -r del contenido, no del directorio)
cp -r "$DIST_SRC/." "$API_DIR/public/"

# El index.html de Angular convive con index.php de Laravel.
# .htaccess decide quién atiende cada request.

# ---------- Migrate + cache ----------
cd "$API_DIR"

echo "==> php artisan migrate"
php artisan migrate --force --no-interaction

echo "==> Re-cachear"
php artisan config:clear  > /dev/null
php artisan route:clear   > /dev/null
php artisan config:cache  > /dev/null
php artisan route:cache   > /dev/null

echo "==> Permisos storage / bootstrap/cache"
chmod -R 775 storage bootstrap/cache 2>/dev/null || true

# ---------- Smoke test ----------
echo "==> Smoke test ($PROJECT_DOMAIN)"
for path in "${SMOKE_PATHS[@]}"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://${PROJECT_DOMAIN}${path}")
    echo "  $code  $path"
done

echo "==> Deploy completo ✓"
