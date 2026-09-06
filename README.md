# MinerStock

Sistema de control de compras, bodegas y logística para una empresa minera con varias bodegas (municipio y minas).

**Stack:** Laravel 13 (API REST, `api/`) + Angular 21 SPA (`web/`, Tailwind 4 + PrimeNG 21) + MySQL 8.
**Auth:** Laravel Sanctum (tokens) + roles y permisos con `spatie/laravel-permission`.

Documentación de planeamiento en [`docs/`](docs/):

| Doc | Contenido |
|---|---|
| [01-propuesta-inicial.md](docs/01-propuesta-inicial.md) | Alcance, decisiones, flujo de documentos, fases |
| [02-modelo-de-datos.md](docs/02-modelo-de-datos.md) | Tablas, campos y reglas de negocio |
| [03-modulos-y-pantallas.md](docs/03-modulos-y-pantallas.md) | Pantallas por módulo y matriz de permisos |
| [04-prompts-stitch.md](docs/04-prompts-stitch.md) | Prompts usados para el diseño en Stitch |
| [05-design-system.md](docs/05-design-system.md) | Tokens del sistema de diseño (colores, tipografía, componentes) |

---

## Estructura

```
minerstock/
├── api/                Laravel 13 — API REST (rutas /api/*)
├── web/                Angular 21 SPA — consume la API
├── docs/               Planeamiento y diseño
├── deploy.sh           Script de deploy (correr en servidor)
└── README.md
```

## Desarrollo local (Laragon, Windows)

**Pre-requisitos:** PHP 8.3+, Composer, Node 20+, MySQL 8 (incluido en Laragon).

### 1) Base de datos

```sql
CREATE DATABASE minerstock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2) API (Laravel)

```bash
cd api
composer install
cp .env.example .env       # solo la primera vez
php artisan key:generate   # solo la primera vez
php artisan migrate --seed # crea roles, unidades, consecutivos, admin y datos demo (solo en local)
php artisan serve          # http://localhost:8000
```

Verifica: `http://localhost:8000/api/health` → JSON `{"status":"ok",...}`.

**Usuarios sembrados (solo entorno local):**

| Usuario / correo | Contraseña | Rol |
|---|---|---|
| `admin` (o admin@minerstock.local) | changeme | Administrador |
| comprador (comprador@minerstock.local) | password | Comprador |
| aprobador (aprobador@minerstock.local) | password | Aprobador |
| bodeguero (bodeguero@minerstock.local) | password | Bodeguero + Solicitante |
| tesoreria (tesoreria@minerstock.local) | password | Tesorería |
| consulta (consulta@minerstock.local) | password | Consulta |

### 3) SPA (Angular)

```bash
cd web
npm install
npm start                  # http://localhost:4200
```

El dev server proxea `/api` a Laravel vía `web/proxy.conf.json`.

## API

Todas las rutas van bajo `/api`. Salvo `health` y `auth/login`, requieren `Authorization: Bearer <token>`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | smoke test (incluye check de DB) |
| POST | `/auth/login` | `{login, password}` (usuario o correo) → `{token, user}` |
| GET | `/auth/me` | usuario, roles, permisos y bodegas |
| POST | `/auth/logout` | revoca el token actual |
| PUT | `/auth/profile`, `/auth/password` | perfil y contraseña propios |
| CRUD | `/catalog/{sites,warehouses,units,product-categories,products,suppliers,vehicles,drivers,cost-centers,recipients}` | maestros (`?search=&active=&sort=&dir=&page=&per_page=&all=1`) |
| CRUD | `/admin/users` (+ `POST /admin/users/{id}/reset-password`) | usuarios, roles y bodegas asignadas |
| GET/PUT | `/admin/roles`, `/admin/permissions` | matriz rol × permiso |
| GET/PUT | `/admin/settings`, `/admin/document-sequences` | datos de empresa, IVA, consecutivos |

Los permisos siguen el patrón `recurso.accion` (`products.view`, `suppliers.create`, …) y se verifican con el middleware `permission:`.

## Estado del proyecto

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Base: login, roles, layout, maestros, usuarios, configuración | ✅ |
| 1 | Compras: solicitudes con aprobación, cotizaciones, comparativa, OC | pendiente |
| 2 | Inventario municipio: recepciones, kardex, stock, devoluciones, ajustes | pendiente |
| 3 | Cuentas por pagar | pendiente |
| 4 | Logística: planillas, recepción en mina, novedades | pendiente |
| 5 | Consumo en mina: vales, préstamos | pendiente |
| 6 | Dashboards, reportes, notificaciones | pendiente |

## Deploy a producción

Flujo:

```bash
# Local
git add . && git commit -m "..." && git push origin main

# Servidor
cd ~/repos/minerstock && bash deploy.sh
```

`deploy.sh` hace pull, instala dependencias si cambiaron los locks, construye Angular, copia el `dist` a `api/public/`, corre migraciones y cachea config/rutas.
