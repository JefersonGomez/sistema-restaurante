# Menú QR — Sistema de pedidos para restaurantes (Costa Rica)

SaaS multi-restaurante: los comensales escanean un QR en la mesa y ven el menú (ES/EN) en su
celular. Una sola instancia sirve a todos los restaurantes y ninguno puede ver datos de otro.

> **Estado:** Fase 1 completa (base, auth, administración de menú y mesas, menú público y
> esqueleto de tiempo real). Pedidos, cuentas y pantallas de cocina/mesero/caja llegan en la Fase 2.

## Requisitos

- Node.js 20+ (probado con 22)
- pnpm 10+ (`npm i -g pnpm`)
- Docker Desktop (solo para PostgreSQL 16)

## Instalación

```bash
cp .env.example .env   # antes de pnpm install: el postinstall genera el cliente de Prisma
pnpm install
pnpm db:up             # PostgreSQL 16 en Docker (puerto 5433)
pnpm db:migrate        # aplica migraciones
pnpm db:seed           # datos de prueba (imprime la URL de cada mesa)
pnpm dev               # api :4000 · menu :5180 · staff :5181
```

Luego:

- **Menú del comensal:** abrir una de las URLs que imprime el seed,
  `http://localhost:5180/m/<tokenQr>`. El token también se ve con `GET /mesas` (como dueño).
- **Personal:** `http://localhost:5181` → login con las credenciales de abajo.

## Estructura

```
apps/
  api/      Express 5 + Socket.IO + Prisma 7
    src/modules/     auth · restaurantes (admin, propio, usuarios) · menu · mesas · public
    src/middlewares/ auth · roles · tenant · validate · rateLimit · errorHandler
    src/realtime/    Socket.IO (salas por rol, emitToRestaurant)
    src/lib/         env · prisma · tokens · logger
    prisma/          schema, migraciones y seed
    tests/           Vitest + Supertest
  menu/     React: menú del comensal (/m/:token, ES/EN, mobile-first)
  staff/    React: login del personal + página vacía por rol
packages/
  shared/   Esquemas Zod y tipos compartidos entre API y frontends
docs/       Especificación de la Fase 1
```

## Variables de entorno

Todas viven en el `.env` de la raíz (ver `.env.example`). Los frontends solo leen las `VITE_*`.

| Variable               | Ejemplo                                                  | Descripción                               |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------- |
| `DATABASE_URL`         | `postgresql://menuqr:menuqr@localhost:5433/menu_qr`      | BD de desarrollo                          |
| `DATABASE_URL_TEST`    | `postgresql://menuqr:menuqr@localhost:5433/menu_qr_test` | BD de tests (se vacía en cada test)       |
| `PORT`                 | `4000`                                                   | Puerto de la API                          |
| `NODE_ENV`             | `development`                                            | `production` oculta el detalle de errores |
| `JWT_ACCESS_SECRET`    | _(cadena aleatoria de 32+ caracteres)_                   | Firma del access token                    |
| `JWT_ACCESS_TTL`       | `15m`                                                    | Vida del access token                     |
| `JWT_REFRESH_TTL_DIAS` | `7`                                                      | Vida del refresh token (días)             |
| `CORS_ORIGINS`         | `http://localhost:5180,http://localhost:5181`            | Orígenes permitidos (separados por coma)  |
| `MENU_PUBLIC_URL`      | `http://localhost:5180`                                  | Base de la URL que codifica el QR         |
| `VITE_API_URL`         | `http://localhost:4000`                                  | URL de la API para los frontends          |

Generar un secreto: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Credenciales de prueba (creadas por `pnpm db:seed`)

| Rol        | Email                       | Contraseña   |
| ---------- | --------------------------- | ------------ |
| SUPERADMIN | `admin@menuqr.test`         | `Admin123!`  |
| DUENO      | `dueno@sodalaesquina.test`  | `Dueno123!`  |
| MESERO     | `mesero@sodalaesquina.test` | `Mesero123!` |
| COCINA     | `cocina@sodalaesquina.test` | `Cocina123!` |
| CAJA       | `caja@sodalaesquina.test`   | `Caja123!`   |

Restaurante demo: **Soda La Esquina** (`soda-la-esquina`): estaciones Cocina y Bar, 4 categorías,
12 platos ticos (con modificadores obligatorios en gallo pinto, casado con bistec y refresco
natural) y 8 mesas.

El seed es idempotente: si el restaurante demo ya existe no lo modifica. Para empezar de cero:
`pnpm --filter api exec prisma migrate reset` (borra la BD, migra y vuelve a sembrar).

## Tests

```bash
pnpm db:up
pnpm test
```

Los tests aplican las migraciones a `menu_qr_test` y la vacían antes de cada archivo; la BD de
desarrollo no se toca. Cubren:

- **Auth:** login correcto/incorrecto, usuario inactivo, refresh con rotación y detección de
  reuso, logout, `/auth/me`.
- **Rutas protegidas:** 401 sin token y 403 con rol incorrecto.
- **Aislamiento (obligatorio):** el dueño del restaurante A no puede leer, modificar ni borrar
  platos, categorías, mesas, estaciones ni modificadores de B, ni referenciarlos desde los suyos.
- **Menú público:** no devuelve platos/categorías inactivos ni datos de otro restaurante;
  los agotados vienen marcados.
- **Módulos:** superadmin, configuración, usuarios, platos con modificadores, orden, mesas y QR.
- **Tiempo real:** handshake con JWT, salas por rol, `ping`/`pong` y `menu:actualizado`.

## API

Errores siempre con la forma `{ error: { code, message, details? } }`.

### Autenticación

- `POST /auth/login` `{ email, password }` → `{ accessToken, usuario }` + cookie httpOnly `refreshToken`.
- El `accessToken` (15 min) va en `Authorization: Bearer <token>`.
- `POST /auth/refresh` usa la cookie, rota el refresh token y devuelve un `accessToken` nuevo.
  Reusar un refresh token ya rotado revoca todas las sesiones del usuario.
- `POST /auth/logout` revoca el refresh token. `GET /auth/me` devuelve el usuario actual.
- Login limitado a 10 intentos fallidos por IP cada 15 minutos.

### Endpoints

| Rol                    | Rutas                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| SUPERADMIN             | `POST/GET /admin/restaurantes`, `PATCH /admin/restaurantes/:id` (activo, plan)         |
| DUENO                  | `GET/PATCH /restaurante`                                                               |
| DUENO                  | CRUD `/usuarios`, `/estaciones`, `/categorias` (+ `PATCH /categorias/orden`), `/mesas` |
| DUENO                  | CRUD `/platos`, `/platos/:platoId/grupos-modificadores[/:grupoId/modificadores]`       |
| DUENO                  | `POST /mesas/:id/regenerar-token`, `GET /mesas/:id/qr?formato=png\|svg`                |
| DUENO                  | `POST /uploads/firma` → 501 (la subida a Cloudflare R2 llega luego)                    |
| DUENO, MESERO, COCINA  | `GET /platos`, `GET /platos/:id`, `PATCH /platos/:id/agotado`                          |
| Público (rate limited) | `GET /public/:slug/menu`, `GET /public/mesa/:token`                                    |
| Público                | `GET /health`                                                                          |

El `restauranteId` de las rutas privadas sale siempre del JWT; si se manda en body o query se ignora.

### Tiempo real (Socket.IO)

Conectar al mismo host de la API con `auth: { token: <accessToken> }`. Según el rol, el socket
entra a `rest:{id}` y a las salas `rest:{id}:cocina|bar|meseros|caja` (el dueño a todas; cocina a
cocina y bar). Eventos: `ping` → `pong`; `menu:actualizado` al marcar un plato agotado.

## Scripts

| Script                      | Qué hace                        |
| --------------------------- | ------------------------------- |
| `pnpm dev`                  | API, menu y staff en paralelo   |
| `pnpm build`                | Build de los frontends          |
| `pnpm db:up`                | `docker compose up -d postgres` |
| `pnpm db:migrate`           | `prisma migrate dev`            |
| `pnpm db:seed`              | Datos de prueba                 |
| `pnpm test`                 | Tests de la API                 |
| `pnpm typecheck`            | `tsc` en todos los paquetes     |
| `pnpm lint` / `pnpm format` | ESLint / Prettier               |

## Fuera de alcance en Fase 1

Pedidos, cuentas, pantallas de cocina/mesero/caja, pagos, facturación electrónica,
impresión de comandas, reportes, subida real de imágenes, despliegue.
