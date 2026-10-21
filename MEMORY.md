# MEMORY.md — Estado del proyecto

> Leer al inicio de cada sesión. Actualizar después de cada cambio.
> Spec completa: `docs/especificacion-fase1.md`.

## Estado actual

- **Fecha última actualización:** 2026-10-20
- **Fase 1 completa** (1.6–1.10 hechas y verificadas, pendientes de validar commit). Siguiente: Fase 2
  (pedidos, cuentas, pantallas de cocina/mesero/caja) cuando el usuario la defina.
- Repo remoto: https://github.com/JefersonGomez/sistema-restaurante (rama `main`).
  **Antes de cada commit/push: mostrar al usuario qué se sube y esperar su validación.**
- Raíz del monorepo: `F:\sistema-restaurante` (equivale a `menu-qr/` de la spec).

## Plan de la Fase 1 (sub-fases)

| #    | Sub-fase                                                                                                                                     | Verificación                       | Estado |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------ |
| 1.1  | Monorepo y tooling (pnpm workspaces, TS estricto, ESLint, Prettier, `packages/shared`)                                                       | `pnpm install`, `pnpm lint`, `tsc` | ✅     |
| 1.2  | Docker Compose (Postgres 16) + Prisma schema completo + migración inicial                                                                    | `pnpm db:up`, `pnpm db:migrate`    | ✅     |
| 1.3  | Seed (superadmin, Soda La Esquina, usuarios, estaciones, 4 categorías, 12 platos, modificadores, 8 mesas)                                    | `pnpm db:seed` y consulta          | ✅     |
| 1.4  | Auth: login, refresh, logout, me (JWT + bcrypt + RefreshToken hasheado)                                                                      | tests de login                     | ✅     |
| 1.5  | Middlewares: auth, requireRole, tenant, validate, errorHandler, rate limit, helmet, CORS                                                     | tests 401/403                      | ✅     |
| 1.6  | Módulos: admin/restaurantes, restaurante, usuarios, estaciones, categorías, platos, modificadores, mesas (+QR, regenerar token), uploads 501 | test de aislamiento A/B            | ✅     |
| 1.7  | Público: `/public/:slug/menu`, `/public/mesa/:token`, `/health`                                                                              | test menú público                  | ✅     |
| 1.8  | Socket.IO: handshake JWT, salas por rol, `emitToRestaurant`, ping/pong, `menu:actualizado`                                                   | test de socket                     | ✅     |
| 1.9  | Frontends: `apps/menu` (/m/:token, ES/EN) y `apps/staff` (login + página por rol)                                                            | `pnpm build`, prueba manual        | ✅     |
| 1.10 | Tests finales + README completo + recorrido de criterios de aceptación                                                                       | `pnpm test` verde                  | ✅     |

Leyenda: ⬜ pendiente · 🟡 en curso · ✅ hecho

## Decisiones tomadas

- Puertos propuestos: API `4000`, menu `5180`, staff `5181` (3000 y 5173 los usan otros proyectos locales), Postgres `5433` (host; 5432 lo usa otro proyecto local).
- Tests usan una BD separada `menu_qr_test` en el mismo contenedor Postgres.
- Logger: `console` envuelto en `lib/logger.ts` (sin librería extra).
- `pnpm dev` en paralelo con `pnpm -r --parallel --filter ./apps/* dev` (sin `concurrently`).
- TypeScript fijado en `~6.0` (TS 7 aún no es compatible con typescript-eslint 8). `@types/node` ^22.
- `packages/shared` se consume como fuente TS (`exports` → `src/index.ts`), `moduleResolution: Bundler`
  en todo el repo. La API corre con `tsx` (no hay build de producción en Fase 1).
- ESLint 10 flat config (`eslint.config.js`) + `eslint-config-prettier`.
- Refresh token en cookie httpOnly; access token en header `Authorization: Bearer`.
- **Prisma 7.10.1** (estable; `latest` en npm es un RC de 8). Usa `prisma.config.ts`, generator
  `prisma-client` con salida en `apps/api/src/generated/prisma` (ignorado en git, se genera en
  `postinstall`) y driver adapter `@prisma/adapter-pg` (obligatorio en Prisma 7).
- `pnpm install` necesita `.env` (prisma.config lee `DATABASE_URL`): copiar `.env.example` antes.
- `lib/env.ts` carga el `.env` de la raíz y lo valida con Zod; todo lo que use env importa de ahí.
- Docker: `docker/init-test-db.sql` crea `menu_qr_test` la primera vez que se crea el volumen.
- `GrupoModificadores` y `Modificador` llevan `restauranteId` (no está en la spec) para filtrar
  por tenant sin joins. `PedidoItem*` no (dependen de `Pedido`).
- Seed idempotente (no toca el restaurante demo si ya existe); creación del demo en una transacción.
  Reset completo: `pnpm --filter api exec prisma migrate reset`.
- Express 5 (errores async llegan solos al errorHandler, sin wrappers). `req.query` es getter →
  `validate` lo redefine con `Object.defineProperty`.
- Refresh token **opaco** (32 bytes aleatorios, en BD solo su sha256), no JWT → se eliminó
  `JWT_REFRESH_SECRET`. Rotación en cada refresh; reuso de uno revocado revoca todas las sesiones.
  Cookie `refreshToken`: httpOnly, sameSite lax, path `/auth`, secure en producción.
- JWT access: HS256 fijo, payload `{ sub, rol, restauranteId }`. `req.usuario` tipado en `src/types/express.d.ts`.
- Login: mismo error para email inexistente/clave mala/usuario o restaurante inactivo; compara contra
  hash de relleno si no existe el email.
- Errores: `HttpError(status, code, message, details?)` en `middlewares/errorHandler.ts`; Zod→400 VALIDACION,
  Prisma P2002→409, P2025→404, JSON inválido→400, resto→500 (mensaje genérico en producción).
- Tests: `NODE_ENV=test` hace que `env.DATABASE_URL` = `DATABASE_URL_TEST`; `tests/globalSetup.ts`
  corre `prisma migrate deploy`; `limpiarBD()` hace TRUNCATE; helpers `crearRestaurante`, `crearUsuario`, `tokenDe`.
- Rutas privadas: `router.use(autenticar, requireRole(...), tenant)`; el service recibe
  `req.tenant.restauranteId`. `tenant` da 403 `SIN_RESTAURANTE` si el JWT no trae restaurante (superadmin).
- Rate limit (`middlewares/rateLimit.ts`): `limitePublico` 120/min por IP (para `/public`),
  `limiteLogin` 10 fallidos/15 min por IP. Desactivado en `NODE_ENV=test`. Store en memoria.
- CORS con `credentials: true` (la cookie de refresh viaja desde staff).
- `lib/tokens.ts` → `generarTokenQr()` (24 bytes base64url), reutilizar en mesas.
- Patrón de services: `obtener(restauranteId, id)` con `findFirst({ where: { id, restauranteId } })`
  → 404 si no es del tenant; luego `update/delete` por id. Recursos de otro restaurante dan **404** (no 403)
  para no revelar que existen.
- Plato: `categoriaId`/`estacionId` se validan contra el tenant. Grupos/modificadores se buscan por
  `(id, platoId, restauranteId)`. Reglas min≤max y obligatorio⇒min≥1 se validan sobre valores finales.
- Borrar algo con dependencias → Prisma P2003 → 409 `EN_USO` (ej. categoría con platos).
- Usuarios: el dueño no puede desactivarse, quitarse el rol ni borrarse; desactivar o cambiar clave
  revoca refresh tokens. Rol `SUPERADMIN` no se puede crear desde `/usuarios`.
- `GET /platos` y `/platos/:id` también para MESERO y COCINA (necesitan ver qué marcar agotado).
- Zod `z.object` descarta campos desconocidos → `restauranteId`, `slug`, `plan` en el body se ignoran.
- Menú público: oculta categorías sin platos activos; no expone `restaurante.id`.
- Socket.IO (`src/realtime/index.ts`): token en `handshake.auth.token`; salas `rest:{id}` (todos) y
  `rest:{id}:cocina|bar|meseros|caja`. DUENO→todas, COCINA→cocina+bar (no hay rol BAR), MESERO→meseros,
  CAJA→caja. `emitToRestaurant(id, sala|'todos', evento, payload)` es no-op si no hay servidor (tests HTTP).
- Frontends: Vite 8, React 19, Tailwind 4 (`@tailwindcss/vite`), react-router-dom 7. `envDir: '../..'`
  (leen `VITE_*` del `.env` raíz). `strictPort` en 5180/5181.
- staff: access token solo en memoria; al cargar hace un único `/auth/refresh` (memoizado: StrictMode
  dispararía dos y la detección de reuso cerraría la sesión).
- menu: idioma guardado en localStorage (con try/catch), por defecto según `navigator.language`;
  precios con `Intl.NumberFormat` (CRC sin decimales).
- `Restaurante.plan` es `String` (default `basico`); `Mesa` única por `(restauranteId, numero)`.

## Librerías aprobadas fuera de la lista base

- (Implícitas en la spec) helmet, cors, express-rate-limit, qrcode, jsonwebtoken.
- Aprobadas por el usuario (2026-10-20): `tsx`, `react-router-dom`, `cookie-parser`,
  `bcryptjs` (en lugar de `bcrypt`).
- Parte del stack/ecosistema: `@prisma/adapter-pg` (+`pg`), `socket.io-client` (solo tests),
  `@vitejs/plugin-react`, `@tailwindcss/vite`.

## Preguntas abiertas (para el usuario)

- (ninguna)

## Problemas / notas

- En la máquina no hay Python ni `gh` CLI; usar Node/Bash para scripts.
- Puertos 3000 y 5173 ocupados por otras apps locales → API 4000, menu 5180, staff 5181.
- El puerto 5432 lo ocupa el contenedor `inventario-api-postgres-1` (otro proyecto). No tocarlo.
- Al detener `pnpm dev` (tarea en background) en Windows quedan procesos node huérfanos en
  4000/5180/5181: revisar `netstat` y cerrarlos por PID.
- `curl -d` con tildes desde Git Bash manda latin-1 (sale "Vigor�n"): para probar a mano usar Node/fetch.
- Con ESM, `process.loadEnvFile` después de un `import` llega tarde → cargar env siempre vía `lib/env.ts`.

## Historial

- 2026-10-20: creados `CLAUDE.md`, `MEMORY.md`, `README.md`, `docs/especificacion-fase1.md`. Sin código aún.
- 2026-10-20: 1.1 monorepo y tooling (package.json raíz, pnpm-workspace, tsconfig.base, ESLint,
  Prettier, .env.example, `packages/shared` con enums Zod). `git init` + remote `origin`.
- 2026-10-20: 1.1 subida a GitHub (commit inicial).
- 2026-10-20: 1.2 docker-compose (Postgres 16, puerto 5433), schema Prisma completo (14 modelos),
  migración `init`, `lib/env.ts`, `lib/prisma.ts`.
- 2026-10-20: 1.2 subida a GitHub.
- 2026-10-20: 1.3 seed (superadmin + Soda La Esquina: 4 usuarios, 2 estaciones, 4 categorías,
  12 platos, 4 grupos / 12 modificadores, 8 mesas). Dependencia: `bcryptjs`.
- 2026-10-20: 1.3 subida a GitHub.
- 2026-10-20: 1.4 auth (login/refresh/logout/me), errorHandler, validate, autenticar, app/server,
  Vitest + Supertest (10 tests verdes). Dependencias: express 5, jsonwebtoken, cookie-parser, vitest, supertest.
- 2026-10-20: 1.4 subida a GitHub.
- 2026-10-20: 1.5 requireRole, tenant, rate limit, helmet, CORS (17 tests verdes). Dependencias: helmet, cors, express-rate-limit.
- 2026-10-20: 1.5 subida a GitHub.
- 2026-10-20: 1.6 módulos (admin, restaurante, usuarios, estaciones, categorías+orden, platos+agotado,
  grupos/modificadores, mesas+QR+regenerar, uploads 501). 1.7 público + /health. 1.8 Socket.IO.
  1.9 frontends menu y staff. 1.10 tests (45 verdes, incl. aislamiento verificado con mutación),
  README final, prueba desde cero en copia limpia y recorrido de criterios de aceptación.
