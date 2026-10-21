# Menú QR — Sistema de pedidos para restaurantes (Costa Rica)

SaaS multi-restaurante: los comensales escanean un QR en la mesa, ven el menú (ES/EN) en su
celular y piden; los pedidos llegan en tiempo real a cocina, bar, meseros y caja. Una sola
instancia sirve a todos los restaurantes y ninguno puede ver datos de otro.

> **Estado:** Fase 2 completa (pedidos, cuentas, pantallas de cocina/bar, mesero, caja y reporte
> del día). Specs: [`docs/especificacion-fase1.md`](docs/especificacion-fase1.md) y
> [`docs/especificacion-fase2.md`](docs/especificacion-fase2.md).

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

¿Ya tenías la base de la Fase 1? Para cargar las cuentas y pedidos de ejemplo de la Fase 2,
reinicia la base (borra todo y vuelve a sembrar):

```bash
pnpm --filter api exec prisma migrate reset
pnpm db:seed
```

## Prueba de punta a punta

Con `pnpm dev` corriendo y el seed cargado:

1. **Cocina** — en una tablet o ventana: `http://localhost:5181`, entrar con `cocina@sodalaesquina.test`.
   Tocar **Activar sonido** una vez.
2. **Mesero** — en otra ventana (o el celular): entrar con `mesero@sodalaesquina.test`.
3. **Comensal** — abrir la URL de la **mesa 3** que imprimió el seed (`http://localhost:5180/m/<token>`).
   Elegir platos (el casado con bistec pide el término), agregar al pedido y **Enviar pedido**.
4. Con `PRIMER_PEDIDO` (default) el primer pedido queda "esperando confirmación": el mesero lo ve
   en **Pendientes** y toca **Confirmar** → aparece al instante en la pantalla de cocina (y el bar
   recibe solo sus bebidas).
5. Cocina toca cada ítem: **Nuevo → Preparando → Listo**. El comensal ve los estados en "Mi cuenta".
6. El mesero ve el ítem en **Para llevar** y toca **Entregado**.
7. Abrir la misma URL de la mesa 3 en otro navegador: es la misma cuenta y ve los mismos estados.
8. El comensal toca **Pedir la cuenta** → la caja (`caja@sodalaesquina.test`) la ve primero en la
   lista, con subtotal, servicio e IVA. **Imprimir pre-cuenta** abre el ticket de 80 mm.
9. Elegir método de pago y **Cerrar cuenta** → el celular muestra "¡Gracias por su visita!" y la
   mesa queda libre.

El seed deja ejemplos listos para ver en las pantallas: mesa 1 con ítems en preparación, listo y
entregado; mesa 2 con un pedido por confirmar; mesa 4 pidiendo la cuenta; mesa 5 llamando al
mesero; y una cuenta cerrada hoy (mesa 6) que aparece en el reporte **Hoy** del dueño.

### Probar con el celular (misma red Wi-Fi)

1. Averiguar la IP de la PC (`ipconfig` → IPv4, p. ej. `192.168.1.50`).
2. En `.env`: `VITE_API_URL=http://192.168.1.50:4000`, `MENU_PUBLIC_URL=http://192.168.1.50:5180`
   y agregar `http://192.168.1.50:5180,http://192.168.1.50:5181` a `CORS_ORIGINS`.
3. Levantar los frontends visibles en la red: `pnpm --filter api dev`,
   `pnpm --filter menu dev --host` y `pnpm --filter staff dev --host` (tres terminales).
4. Escanear el QR de la mesa (`GET /mesas/:id/qr` como dueño) o abrir la URL en el celular.

Por `http` en la red local el navegador no permite la Screen Wake Lock API (pantalla siempre
encendida); funciona en `localhost` o con HTTPS. Windows puede pedir permiso de firewall para Node.

## Estructura

```
apps/
  api/      Express 5 + Socket.IO + Prisma 7
    src/modules/     auth · restaurantes (admin, propio, usuarios) · menu · mesas · public
                     pedidos (creación, totales, eventos) · operacion · reportes
    src/middlewares/ auth · cliente (sesión del comensal) · roles · tenant · validate · rateLimit · errorHandler
    src/realtime/    Socket.IO (salas, emitToRestaurant, emitToCuenta)
    src/lib/         env · prisma · tokens · logger
    prisma/          schema, migraciones y seed
    scripts/         simular-hora-pico.ts (prueba de carga)
    tests/           Vitest + Supertest
  menu/     React: comensal (/m/:token) — menú, carrito, Mi cuenta en vivo, llamar/pedir cuenta
  staff/    React: login + pantallas de cocina/bar, mesero, caja y "Hoy" del dueño
packages/
  shared/   Esquemas Zod, tipos, calcularTotales() y reglas de modificadores
docs/       Especificaciones
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

| Rol        | Email                       | Contraseña   | Pantalla              |
| ---------- | --------------------------- | ------------ | --------------------- |
| SUPERADMIN | `admin@menuqr.test`         | `Admin123!`  | —                     |
| DUENO      | `dueno@sodalaesquina.test`  | `Dueno123!`  | Hoy + todas las demás |
| MESERO     | `mesero@sodalaesquina.test` | `Mesero123!` | Mesero (celular)      |
| COCINA     | `cocina@sodalaesquina.test` | `Cocina123!` | Cocina/Bar (tablet)   |
| CAJA       | `caja@sodalaesquina.test`   | `Caja123!`   | Caja (computadora)    |

Restaurante demo: **Soda La Esquina** (`soda-la-esquina`): estaciones Cocina y Bar, 4 categorías,
12 platos ticos (con modificadores obligatorios en gallo pinto, casado con bistec y refresco
natural) y 8 mesas. El usuario de cocina no tiene estación asignada, así que ve cocina y bar; si
el dueño le asigna una (`PATCH /usuarios/:id { estacionId }`), solo ve y opera esa.

El seed es idempotente: si el restaurante demo ya existe no lo modifica.

## Reglas de negocio

**Totales** (`packages/shared/src/totales.ts`, función pura con tests). Todo en céntimos; redondeo
"mitad hacia arriba" una vez por concepto sobre la suma de la cuenta. Los ítems cancelados y los
pedidos sin confirmar no suman. El IVA no se cobra sobre el servicio.

- Precios **sin** impuestos: `servicio = subtotal × 10%`, `IVA = subtotal × 13%`, `total = suma`.
- Precios **con** impuestos (el precio del menú ya trae IVA y servicio): `total = suma del menú`,
  `subtotal = total / 1.23`, `servicio = subtotal × 10%`, `IVA = total − subtotal − servicio`.
  Ej.: ₡4 800 → subtotal ₡3 902,44 · servicio ₡390,24 · IVA ₡507,32.

**Confirmación** (`modoConfirmacion`, el dueño lo cambia en "Hoy"): `PRIMER_PEDIDO` (default: el
mesero confirma el primero y la cuenta queda verificada), `SIEMPRE` o `NUNCA`. Los pedidos que
toma el mesero se confirman solos.

**Estados** (cualquier otra transición → 409):
pedido `PENDIENTE → CONFIRMADO | CANCELADO`; ítem `PENDIENTE → EN_PREPARACION → LISTO → ENTREGADO`
(cancelable con motivo mientras no esté LISTO); cuenta `ABIERTA → PIDIO_CUENTA → CERRADA`
(caja también `ABIERTA → CERRADA`). No se cierra una cuenta con pedidos sin confirmar.

**Sesión del comensal:** `GET /public/mesa/:token` abre (o reutiliza) la cuenta de la mesa y entrega
un token de sesión (en BD solo su hash), que vence a las 6 h o al cerrar la cuenta. Cada celular
tiene su sesión sobre la misma cuenta. La cuenta sale siempre de la sesión, nunca del body. Si la
cuenta se cerró, la API responde **410**. Solo puede haber una cuenta no cerrada por mesa
(índice único parcial en PostgreSQL).

**Idempotencia:** cada envío lleva un `clientRequestId`; repetirlo en la misma cuenta devuelve el
pedido ya creado (200) en vez de duplicarlo. El frontend lo guarda antes de enviar y lo reutiliza
en los reintentos, incluso si se recarga la página.

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

| Rol                    | Rutas                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SUPERADMIN             | `POST/GET /admin/restaurantes`, `PATCH /admin/restaurantes/:id` (activo, plan)                                     |
| DUENO                  | `GET/PATCH /restaurante` (incluye `modoConfirmacion`), `GET /reportes/hoy`                                         |
| DUENO                  | CRUD `/usuarios` (con `estacionId`), `/estaciones`, `/categorias` (+ `PATCH /orden`), `/mesas`                     |
| DUENO                  | CRUD `/platos`, `/platos/:platoId/grupos-modificadores[/:grupoId/modificadores]`                                   |
| DUENO                  | `POST /mesas/:id/regenerar-token`, `GET /mesas/:id/qr?formato=png\|svg`, `POST /uploads/firma` (501)               |
| DUENO, MESERO, COCINA  | `GET /platos`, `GET /platos/:id`, `PATCH /platos/:id/agotado`                                                      |
| DUENO, MESERO, CAJA    | `GET /operacion/mesas`, `GET /operacion/cuentas/:id`, `GET /operacion/llamadas?atendida=`                          |
| DUENO, MESERO          | `GET /operacion/pedidos?estado=`, `PATCH /operacion/pedidos/:id/confirmar\|cancelar`                               |
| DUENO, MESERO          | `POST /operacion/mesas/:id/pedidos`, `GET /operacion/items?estado=LISTO`                                           |
| DUENO, MESERO          | `PATCH /operacion/items/:id/cancelar`, `PATCH /operacion/llamadas/:id/atender`                                     |
| DUENO, COCINA          | `GET /operacion/estaciones`, `GET /operacion/estaciones/:id/items`                                                 |
| DUENO, COCINA, MESERO  | `PATCH /operacion/items/:id/estado` (cocina: preparar/listo de su estación; mesero: entregado)                     |
| DUENO, CAJA            | `POST /operacion/cuentas/:id/cerrar` `{ metodoPago }`                                                              |
| Comensal (sesión)      | `GET /public/cuenta`, `POST /public/cuenta/pedidos`, `POST /public/cuenta/llamar`, `POST /public/cuenta/solicitar` |
| Público (rate limited) | `GET /public/:slug/menu`, `GET /public/mesa/:token`, `GET /health`                                                 |

El `restauranteId` de las rutas privadas sale siempre del JWT; si se manda en body o query se ignora.
Rate limit: 1 200 solicitudes/min por IP en `/public` (todos los celulares de un restaurante comparten
la IP del Wi-Fi) y 60/min por sesión de comensal.

### Tiempo real (Socket.IO)

Conectar al host de la API con `auth: { token: <accessToken> }` (personal) o
`auth: { sesion: <token de sesión> }` (comensal). Salas:

| Sala                          | Quién                                             |
| ----------------------------- | ------------------------------------------------- |
| `rest:{id}`                   | todo el personal                                  |
| `rest:{id}:meseros` / `:caja` | meseros y dueño / caja y dueño                    |
| `rest:{id}:estacion:{estId}`  | cocina (su estación, o todas si no tiene) y dueño |
| `rest:{id}:comensales`        | todos los celulares (avisos de menú)              |
| `cuenta:{cuentaId}`           | celulares de esa mesa (solo su cuenta)            |

Eventos (siempre después del commit; cada uno trae `updatedAt`): `pedido:nuevo`, `pedido:confirmado`
(cada estación recibe solo sus ítems), `pedido:cancelado`, `item:estado`, `mesa:llamada`,
`llamada:atendida`, `cuenta:solicitada`, `cuenta:actualizada`, `cuenta:cerrada`, `menu:actualizado`,
`ping` → `pong`. La base de datos es la fuente de verdad: los clientes usan el evento como aviso y
vuelven a pedir el estado por REST, también en cada reconexión.

## Tests

```bash
pnpm db:up
pnpm test
```

Los tests de la API aplican las migraciones a `menu_qr_test` y la vacían antes de cada archivo; la
BD de desarrollo no se toca. Cubren auth, 401/403, aislamiento entre restaurantes (menú, pedidos y
cuentas), menú público, totales y redondeo (función pura), modificadores obligatorio/mín/máx,
platos agotados/inactivos/ajenos, cuenta cerrada (410), idempotencia (secuencial y simultánea),
transiciones inválidas (409), una sola cuenta abierta por mesa con solicitudes simultáneas, que un
comensal no puede usar otra cuenta, permisos por rol en `/operacion` y salas de socket.

### Prueba de carga (hora pico)

Con la API corriendo (`pnpm dev`):

```bash
pnpm --filter api simular                       # 20 mesas durante 5 minutos
MESAS=10 DURACION_SEG=60 pnpm --filter api simular
```

Crea un restaurante aparte (`sim-hora-pico-…`, queda desactivado al terminar), envía pedidos
aleatorios desde 20 mesas con clientes de socket escuchando en cocina, meseros, caja y cada mesa,
reenvía ~10 % de los pedidos con el mismo `clientRequestId`, y reporta la latencia (promedio, p95
y máxima) de creación y de llegada a cocina. Termina con ✅ si no se perdió ni duplicó ningún pedido.

## Scripts

| Script                      | Qué hace                        |
| --------------------------- | ------------------------------- |
| `pnpm dev`                  | API, menu y staff en paralelo   |
| `pnpm build`                | Build de los frontends          |
| `pnpm db:up`                | `docker compose up -d postgres` |
| `pnpm db:migrate`           | `prisma migrate dev`            |
| `pnpm db:seed`              | Datos de prueba                 |
| `pnpm test`                 | Tests (API y `shared`)          |
| `pnpm typecheck`            | `tsc` en todos los paquetes     |
| `pnpm lint` / `pnpm format` | ESLint / Prettier               |

## Fuera de alcance (Fase 2)

Pagos en línea, integración con SINPE o pasarelas, facturación electrónica de Hacienda (la
pre-cuenta impresa dice "NO ES FACTURA ELECTRÓNICA"), impresión directa a impresoras térmicas,
notificaciones push, modo offline completo, dividir la cuenta por persona, reservas, reportes
avanzados y despliegue.
