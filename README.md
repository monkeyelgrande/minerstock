# monkeystechnology.com

Vitrina personal-tech de Monkeys Technology: feed del canal de YouTube `@monkeystechnology` + reviews de productos tech.

**Stack:** Laravel 13 (API REST, `api/`) + Angular 21 SPA (`web/`) + MySQL.
**Hosting prod:** Virtualmin sub-server de `monkeyscompany.com` (Ubuntu 24.04 LTS).
**Auth admin:** Laravel Sanctum (tokens).

---

## Estructura

```
monkeystechnology/
├── api/                Laravel 13 — API REST (rutas /api/*)
├── web/                Angular 21 SPA — consume la API
├── deploy.sh           Script de deploy (correr en servidor)
├── .gitignore
└── README.md
```

## Desarrollo local (Laragon, Windows)

**Pre-requisitos:** PHP 8.3+, Composer, Node 20+, MySQL (incluido en Laragon).

### 1) Base de datos

Crear DB vacía en MySQL local:

```sql
CREATE DATABASE monkeystechnology CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2) API (Laravel)

```bash
cd api
composer install
cp .env.example .env       # solo la primera vez
php artisan key:generate   # solo la primera vez
php artisan migrate --seed
php artisan serve          # http://localhost:8000
```

Verifica: `http://localhost:8000/api/health` → JSON `{"status":"ok",...}`.

### 3) SPA (Angular)

```bash
cd web
npm install
npm start                  # http://localhost:4200
```

Angular dev server proxea `/api` a Laravel vía `web/proxy.conf.json`.

## Endpoints públicos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | smoke test (incluye check de DB) |
| GET | `/api/categories` | listado de categorías con conteo de reviews publicadas |
| GET | `/api/categories/{slug}` | detalle de categoría |
| GET | `/api/reviews` | reviews publicadas, paginadas (`?category=`, `?featured=1`, `?per_page=`) |
| GET | `/api/reviews/{slug}` | detalle de review (incluye body y galería) |
| GET | `/api/videos` | videos curados del canal (`?featured=1`, `?limit=`) |
| GET | `/api/videos/{youtube_id}` | detalle de video |
| GET | `/api/me` | usuario autenticado (requiere `auth:sanctum`) |

Endpoints de admin (POST/PUT/DELETE) viven bajo `auth:sanctum` — pendientes.

## Deploy a producción

Flujo:

```bash
# Local
git add . && git commit -m "..." && git push origin main

# Server
ssh monkeyscompany "cd ~/repos/monkeystechnology && bash deploy.sh"
```

`deploy.sh` hace: pull → composer install (si cambió) → npm ci (si cambió) → `ng build` prod → copia dist Angular a `api/public/` → `php artisan migrate` → re-cachea → smoke test.

**Primera vez en el servidor** (configurar una sola vez):

1. `git clone` el repo en `~/repos/monkeystechnology/`.
2. Crear `api/.env` de producción (perms 600, `APP_ENV=production`, `APP_DEBUG=false`, credenciales MySQL del Virtualmin padre).
3. En Virtualmin → Server Configuration → Website Options → Document Root = `/home/monkeyscompany/repos/monkeystechnology/api/public`.
4. Verificar Let's Encrypt cubre `monkeystechnology.com` y `caja.monkeystechnology.com`.
5. Primer `composer install` y `php artisan migrate` manuales (luego `deploy.sh` se encarga).

Detalles en [`deploy.sh`](./deploy.sh).

---

## Usar este repo como template para otro proyecto

Esta base (Laravel API + Angular SPA + Sanctum + deploy.sh para Virtualmin) está pensada para reusarse. Para forkear:

1. **En GitHub:** Settings del repo → "Template repository" → click "Use this template" desde el botón verde.
2. **Clonar el repo nuevo y limpiar referencias específicas:**

   | Archivo | Qué cambiar |
   |---|---|
   | `deploy.sh` | `PROJECT_NAME` y `PROJECT_DOMAIN` en el bloque `PROJECT CONFIG` |
   | `api/.env.example` | `APP_NAME`, `DB_DATABASE`, `SANCTUM_STATEFUL_DOMAINS`, `CORS_ALLOWED_ORIGINS` |
   | `api/database/seeders/DatabaseSeeder.php` | Borrar / reemplazar contenido demo (categorías, review de ThinkPad, video Rick Roll) |
   | `README.md` | Este archivo |
   | `api/composer.json` `name` (opcional) | `vendor/proyecto` |
   | `web/package.json` `name` (opcional) | nombre del proyecto |

3. Crear DB local con el nombre nuevo, `composer install`, `npm install`, `php artisan key:generate`, `php artisan migrate --seed`.

Lo que NO necesitas tocar (es genérico): controllers, resources, models (Category/Review/Video), `.htaccess`, estructura de carpetas, `proxy.conf.json`.
