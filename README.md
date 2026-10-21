# Menú QR — Sistema de pedidos para restaurantes (Costa Rica)

SaaS multi-restaurante: los comensales escanean un QR en la mesa, ven el menú (ES/EN) en su
celular y, en fases futuras, piden directo a cocina, bar y meseros.

> **Estado:** Fase 1 en desarrollo. Este README se actualiza al cerrar cada sub-fase
> (ver `MEMORY.md`). Las secciones marcadas _(pendiente)_ aún no funcionan.

## Requisitos

- Node.js 20+ (probado con 22)
- pnpm 10+ (`npm i -g pnpm`)
- Docker Desktop (solo para PostgreSQL 16)

## Estructura

```
apps/
  api/      Express + Socket.IO + Prisma
  menu/     React: menú del comensal  → http://localhost:5173/m/<tokenQr>
  staff/    React: login del personal → http://localhost:5174
packages/
  shared/   Tipos y esquemas Zod compartidos
docs/       Especificación
```

## Instalación _(pendiente)_

```bash
cp .env.example .env
pnpm install
pnpm db:up        # levanta PostgreSQL en Docker
pnpm db:migrate   # aplica migraciones
pnpm db:seed      # carga datos de prueba
pnpm dev          # api :3000, menu :5173, staff :5174
```

## Variables de entorno _(pendiente — definitivas en `.env.example`)_

| Variable               | Ejemplo                                                  | Descripción                       |
| ---------------------- | -------------------------------------------------------- | --------------------------------- |
| `DATABASE_URL`         | `postgresql://menuqr:menuqr@localhost:5433/menu_qr`      | BD de desarrollo                  |
| `DATABASE_URL_TEST`    | `postgresql://menuqr:menuqr@localhost:5433/menu_qr_test` | BD de tests                       |
| `PORT`                 | `3000`                                                   | Puerto de la API                  |
| `NODE_ENV`             | `development`                                            | `production` oculta stack traces  |
| `JWT_ACCESS_SECRET`    | _(cadena larga aleatoria)_                               | Firma del access token            |
| `JWT_REFRESH_SECRET`   | _(cadena larga aleatoria)_                               | Firma del refresh token           |
| `JWT_ACCESS_TTL`       | `15m`                                                    | Vida del access token             |
| `JWT_REFRESH_TTL_DIAS` | `7`                                                      | Vida del refresh token            |
| `CORS_ORIGINS`         | `http://localhost:5173,http://localhost:5174`            | Orígenes permitidos               |
| `MENU_PUBLIC_URL`      | `http://localhost:5173`                                  | Base de la URL que codifica el QR |
| `VITE_API_URL`         | `http://localhost:3000`                                  | URL de la API para los frontends  |

## Credenciales de prueba _(pendiente — se crean con `pnpm db:seed`)_

| Rol        | Email                       | Contraseña   |
| ---------- | --------------------------- | ------------ |
| SUPERADMIN | `admin@menuqr.test`         | `Admin123!`  |
| DUENO      | `dueno@sodalaesquina.test`  | `Dueno123!`  |
| MESERO     | `mesero@sodalaesquina.test` | `Mesero123!` |
| COCINA     | `cocina@sodalaesquina.test` | `Cocina123!` |
| CAJA       | `caja@sodalaesquina.test`   | `Caja123!`   |

Restaurante demo: **Soda La Esquina** (`soda-la-esquina`), 8 mesas. Los tokens QR de las mesas
se imprimen en consola al correr el seed.

## Tests _(pendiente)_

```bash
pnpm db:up
pnpm test       # Vitest + Supertest contra la BD menu_qr_test
```

Incluye: login, 401/403, **aislamiento entre restaurantes** y menú público.

## Scripts

| Script                      | Qué hace                        |
| --------------------------- | ------------------------------- |
| `pnpm dev`                  | API, menu y staff en paralelo   |
| `pnpm db:up`                | `docker compose up -d postgres` |
| `pnpm db:migrate`           | `prisma migrate dev`            |
| `pnpm db:seed`              | Datos de prueba                 |
| `pnpm test`                 | Tests                           |
| `pnpm lint` / `pnpm format` | ESLint / Prettier               |

## Fuera de alcance en Fase 1

Pedidos, cuentas, pantallas de cocina/mesero/caja, pagos, facturación electrónica,
impresión de comandas, reportes, subida real de imágenes, despliegue.
