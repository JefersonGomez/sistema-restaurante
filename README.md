# Menú QR — Sistema de pedidos para restaurantes (Costa Rica)

SaaS multi-restaurante: los comensales escanean un QR en la mesa, ven el menú (ES/EN) en su
celular y piden; los pedidos llegan en tiempo real a cocina, bar, meseros y caja. Una sola
instancia sirve a todos los restaurantes y ninguno puede ver datos de otro.

> **Estado:** Fase 5 completa (pedidos en línea para recoger y a domicilio, con pago en efectivo o
> SINPE Móvil verificado a mano). Specs: [`fase 1`](docs/especificacion-fase1.md),
> [`fase 2`](docs/especificacion-fase2.md), [`frontend del menú`](docs/especificacion-frontend-menu.md),
> [`fase 3`](docs/especificacion-fase3.md), [`fase 4`](docs/especificacion-fase4.md) y
> [`fase 5`](docs/especificacion-fase5.md).

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

El seed completa lo que falte sin borrar nada (fotos de platos, 30 días de ventas, tablet), así
que sobre una base ya sembrada basta con `pnpm db:migrate` y `pnpm db:seed`. Para empezar de
cero (borra todo y vuelve a sembrar):

```bash
pnpm --filter api exec prisma migrate reset
pnpm db:seed
```

## Prueba de punta a punta

Con `pnpm dev` corriendo y el seed cargado:

1. **Cocina** — en una tablet o ventana: `http://localhost:5181`, entrar con `cocina@sodalaesquina.test`
   (o vincular la tablet y entrar con PIN, ver **Dispositivos**). Tocar **Activar sonido** una vez.
2. **Mesero** — en otra ventana (o el celular): entrar con `mesero@sodalaesquina.test`.
3. **Comensal** — abrir la URL de la **mesa 3** que imprimió el seed (`http://localhost:5180/m/<token>`).
   Elegir platos (el casado con bistec pide el término), agregar al pedido y **Enviar pedido**.
4. Con `PRIMER_PEDIDO` (default) el primer pedido queda "esperando confirmación": el mesero lo ve
   en **Pendientes** y toca **Confirmar y enviar a cocina** → aparece al instante en la columna
   **Nuevos** de la cocina (y el bar recibe solo sus bebidas).
5. Cocina toca cada ítem: pasa a **En preparación** y luego a **Listos** (un toque equivocado se
   deshace con **Deshacer** durante 5 s). El comensal ve los estados en "Mi cuenta".
6. El mesero ve "Listo para llevar" en **Pendientes** (y la insignia en la mesa) y toca **Entregado**.
7. Abrir la misma URL de la mesa 3 en otro navegador: es la misma cuenta y ve los mismos estados.
8. El comensal toca **Pedir la cuenta** → la caja (`caja@sodalaesquina.test`) la ve primero en la
   lista, con subtotal, servicio e IVA. **Imprimir pre-cuenta** abre el ticket de 80 mm.
9. Elegir método de pago y **Cerrar cuenta** → el celular muestra "¡Gracias por su visita!" y la
   mesa queda libre.

El seed deja ejemplos listos para ver en las pantallas: mesa 1 con ítems en preparación, listo y
entregado; mesa 2 con un pedido por confirmar; mesa 4 pidiendo la cuenta; mesa 5 llamando al
mesero; y una cuenta cerrada hoy (mesa 6) que aparece en el reporte **Hoy** del dueño.

> Fuera del horario del restaurante (lunes a sábado 7:00–21:00, domingo 8:00–15:00, hora de Costa
> Rica) el menú se ve pero no deja pedir. Para probar de noche, agregue un turno en Panel → Ajustes.

### Recorrido de la Fase 4

1. **Avisos:** en cocina, mesero o caja toque una vez la pantalla (activa el sonido) o
   "Activar sonido y avisos" (también pide permiso para las notificaciones del sistema; solo en
   `localhost` o https). La campanita guarda los avisos aunque cambie de pantalla. Llamar al
   mesero desde el menú suena siempre; si la mesa vuelve a llamar sin ser atendida, se le recuerda
   (máximo cada 30 s).
2. **Alertas por tiempo:** en cocina, un pedido con más de 10 min sin empezar se marca con un
   contorno rojo que late; en el mesero, un plato listo con más de 5 min sin llevarse, en verde.
   Varios a la vez → un solo aviso y un solo sonido.
3. **Animaciones:** tenedor y cuchillo que se cruzan al entrar y al abrir el menú; transiciones
   entre pantallas; las mesas tienen ícono y se levantan con el cursor. En el panel, la barra
   lateral se despliega al acercar el cursor; en el celular, el menú es un cajón lateral.
4. **Personas por mesa:** el primero que escanea el QR dice cuántos son. Si la mesa está llena,
   quien escanea ve "La mesa N ya tiene una cuenta de X personas, ¿está usted en esta mesa?" y los
   celulares de la mesa reciben "Alguien quiere unirse" para aceptar o rechazar (aceptar sube el
   cupo en 1). Con 3 rechazos o 5 intentos en 10 min la mesa se bloquea; se desbloquea desde
   "Mi cuenta". Para probarlo use dos navegadores (uno en incógnito).
5. **Cuentas separadas:** en caja, "¿Cómo pagan? → Separado": elija los platos de cada grupo (de
   un "2× café" puede cobrar 1), el método de pago y "Cobrar este grupo". Cada grupo tiene su
   comprobante para imprimir y se puede deshacer; al cobrar lo último la cuenta se cierra sola.
6. **Registro y personalización:** en `/registro` se crea un restaurante nuevo; después el dueño
   llega a Panel → **Personalizar** (logo, banner, eslogan, color, teléfono, dirección y enlace de
   Google Maps, con vista previa). El cliente ve el banner arriba del menú y, al final, la
   tarjeta "Encuéntrenos" con el mapa y "Cómo llegar".

### Pedidos en línea (Fase 5)

1. Dueño → **Ajustes → Pedidos en línea**: activar, para recoger y/o a domicilio, tiempo estimado,
   pedido mínimo, costo de envío, zona de entrega, número de SINPE Móvil y **minutos para pagar el
   SINPE** (default 15). Ahí está el enlace para
   compartir (`http://localhost:5180/r/soda-la-esquina`) y su QR para descargar.
2. Cliente (en el celular o la computadora): abre el enlace, elige platos (los mismos del menú,
   con promoción y menús del día), toca **Ver pedido**, elige para recoger o a domicilio, escribe sus
   datos y la forma de pago (efectivo o SINPE: ve el número y el monto) y **Hacer pedido**. Queda en
   una página de seguimiento que se actualiza sola.
3. Personal (dueño, caja o mesero) → **En línea**: el pedido llega con sonido a "Nuevos". **Aceptar**
   (con el tiempo estimado) lo manda a cocina; **Rechazar** pide un motivo que ve el cliente. Con
   SINPE, aceptado queda "esperando el SINPE" (con la cuenta regresiva para el cliente y el personal)
   y pasa a cocina solo al tocar **Pago verificado**; si no pagan, **Cancelar** con motivo.
4. Cocina lo ve como "Para llevar #N · nombre" o "Domicilio #N · nombre" y lo prepara como siempre.
5. En "En curso": **Pago verificado** (SINPE), **Listo para entregar**, **Salió a entregar**
   (domicilio) y **Entregado y cobrado** (con el método). El cliente ve cada paso.
6. Los pedidos en línea no llevan el 10 % de servicio; a domicilio se suma el envío. En Reportes
   aparecen en **Por canal** (en mesa, para recoger, a domicilio); los rechazados no cuentan.

### Domicilio con repartidor (Fase 7)

1. Como dueño, en **Panel → Personal** cree un usuario con rol **Repartidor** (el seed ya trae a
   `repartidor@sodalaesquina.test`).
2. Abra `http://localhost:5180/r/soda-la-esquina`, agregue platos, elija **A domicilio** y, además
   de la dirección, toque **Usar mi ubicación actual** o **Marcar en el mapa** y mueva el pin. La
   ubicación del navegador solo funciona en `localhost` o con HTTPS.
3. En **En línea** (caja, mesero o dueño) acepte el pedido: la tarjeta muestra "punto en el mapa" y
   un selector **Elegir repartidor**. Al elegirlo, al repartidor le suena el aviso.
4. En otra ventana entre como repartidor: **Mis entregas** muestra el pedido con **Llamar**,
   **Google Maps** y **Waze**. Cuando cocina termina y alguien marca **Listo para entregar**,
   aparece **Salí a entregar**; luego **Entregué** con el método de pago.
5. En **Caja** aparece **Efectivo de repartidores** con lo que trae cada uno; **Recibido** lo cuadra.

### Promoción y menús del día

En Panel → **Menú**, arriba de todo:

- **Promoción del día:** un plato destacado en el banner del menú, con texto, precio especial (es
  el que se cobra) y color de fondo a elección (con vista previa).
- **Menús del día:** "Agregar menú del día" crea un combo con precio fijo (p. ej. sopa + casado +
  fresco) que se ofrece los días de la semana marcados o solo en una fecha ("Solo hoy"). Fijo:
  escriba lo que incluye en la descripción. Con opciones: agregue grupos (p. ej. «Carne») para que
  el cliente elija. El cliente lo ve en "Menú del día", arriba de las categorías; otro día no se
  puede pedir.

### Registrar un restaurante nuevo

En `http://localhost:5181/registro` (o "Cree su cuenta" en el login): datos del local (nombre,
teléfono, dirección) y del dueño (nombre, correo, contraseña). El restaurante queda activo con las
estaciones Cocina y Bar y abierto todos los días de 7:00 a 21:00; el dueño entra directo a su panel.
Límite: 5 registros por hora por IP.

### Recorrido de la Fase 3

Entrar como dueño (`dueno@sodalaesquina.test`) en `http://localhost:5181/panel`:

1. **Menú** → "Nuevo plato": subir o tomar una foto con la cámara del celular, nombres ES/EN,
   modificadores y vista previa. Al guardar aparece en el menú del comensal en segundos.
2. **Mesas y QR** → crear las mesas 1 a 12 y descargar el PDF (6 por hoja tamaño carta o una por
   hoja para acrílico). Cada QR abre su mesa.
3. **Ajustes** → horario por turnos, "Cerrar temporalmente" (el menú muestra "Cerrado" y no deja
   pedir), color del menú, impuestos y promoción.
4. **Personal** → "Poner PIN" a la persona de cocina; **Dispositivos** → "Vincular tablet" y en la
   tablet abrir `/tablet`, escribir el código y entrar con el PIN: solo ve los pedidos de su estación.
5. **Reportes** → "30 días" (el seed trae un mes de ventas): ventas por día y hora, platos, métodos
   de pago, vistos vs. pedidos, preparación y cancelaciones. **Exportar CSV** baja lo mismo que se ve.
6. Cocina, mesero y caja siguen el modo claro u oscuro del sistema operativo.

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
  menu/     React: comensal — /m/:token (menú), /carrito, /cuenta; TanStack Query + Zustand
    src/componentes/ estructura · menu · detalle · cuenta     src/pantallas/ Menu · Cart · Account
    src/datos/       mesa (consultas + socket) · envio (reintentos) · acciones
    src/estado/      carrito · idioma · avisos             src/textos/ es · en
  staff/    React: login + pantallas de cocina/bar, mesero, caja y "Hoy" del dueño
packages/
  shared/   Esquemas Zod, tipos, calcularTotales(), estaAbierto() y reglas de modificadores
  ui/       Tokens de diseño (tokens.css), textos ES/EN y componentes compartidos por menu y staff
docs/       Especificaciones
```

## Variables de entorno

Todas viven en el `.env` de la raíz (ver `.env.example`). Los frontends solo leen las `VITE_*`.

| Variable                                                                                  | Ejemplo                                                  | Descripción                                                   |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`                                                                            | `postgresql://menuqr:menuqr@localhost:5433/menu_qr`      | BD de desarrollo                                              |
| `DATABASE_URL_TEST`                                                                       | `postgresql://menuqr:menuqr@localhost:5433/menu_qr_test` | BD de tests (se vacía en cada test)                           |
| `PORT`                                                                                    | `4000`                                                   | Puerto de la API                                              |
| `NODE_ENV`                                                                                | `development`                                            | `production` oculta el detalle de errores                     |
| `JWT_ACCESS_SECRET`                                                                       | _(cadena aleatoria de 32+ caracteres)_                   | Firma del access token                                        |
| `JWT_ACCESS_TTL`                                                                          | `15m`                                                    | Vida del access token                                         |
| `JWT_REFRESH_TTL_DIAS`                                                                    | `7`                                                      | Vida del refresh token (días)                                 |
| `CORS_ORIGINS`                                                                            | `http://localhost:5180,http://localhost:5181`            | Orígenes permitidos (separados por coma)                      |
| `MENU_PUBLIC_URL`                                                                         | `http://localhost:5180`                                  | Base de la URL que codifica el QR                             |
| `VITE_API_URL`                                                                            | `http://localhost:4000`                                  | URL de la API para los frontends                              |
| `STORAGE_DRIVER`                                                                          | `local`                                                  | `local` (disco, servido en `/uploads`) o `r2` (Cloudflare R2) |
| `UPLOADS_DIR`                                                                             | `apps/api/uploads`                                       | Carpeta de imágenes con `local`                               |
| `API_PUBLIC_URL`                                                                          | `http://localhost:4000`                                  | Base de las URLs de imágenes locales                          |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | —                                                        | Obligatorias con `STORAGE_DRIVER=r2`                          |

Generar un secreto: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Credenciales de prueba (creadas por `pnpm db:seed`)

| Rol        | Email                           | Contraseña       | Pantalla               |
| ---------- | ------------------------------- | ---------------- | ---------------------- |
| SUPERADMIN | `admin@menuqr.test`             | `Admin123!`      | —                      |
| DUENO      | `dueno@sodalaesquina.test`      | `Dueno123!`      | Hoy + todas las demás  |
| MESERO     | `mesero@sodalaesquina.test`     | `Mesero123!`     | Mesero (celular)       |
| COCINA     | `cocina@sodalaesquina.test`     | `Cocina123!`     | Cocina/Bar (tablet)    |
| CAJA       | `caja@sodalaesquina.test`       | `Caja123!`       | Caja (computadora)     |
| REPARTIDOR | `repartidor@sodalaesquina.test` | `Repartidor123!` | Mis entregas (celular) |

Lucía (cocina) tiene además el **PIN `1234`** para entrar en una tablet vinculada (ver abajo).

Restaurante demo: **Soda La Esquina** (`soda-la-esquina`): estaciones Cocina y Bar, 4 categorías,
12 platos ticos (con modificadores obligatorios en gallo pinto, casado con bistec y refresco
natural) y 8 mesas. El usuario de cocina no tiene estación asignada, así que ve cocina y bar; si
el dueño le asigna una (`PATCH /usuarios/:id { estacionId }`), solo ve y opera esa.

Horario de lunes a sábado 7:00–21:00 y domingo 8:00–15:00, un ícono por categoría y la promoción
"Jueves de chifrijo" a ₡3 500 (normal ₡3 900).

Además el seed genera una foto simple para cada plato (con sharp, en `UPLOADS_DIR`), deja
vinculada una "Tablet de la cocina" y crea **30 días de cuentas cerradas** al azar (con semilla fija:
siempre los mismos datos) para que los reportes tengan qué mostrar.

El seed es idempotente: si el restaurante demo ya existe no lo vuelve a crear, solo agrega lo
anterior si falta.

## Reglas de negocio

**Totales** (`packages/shared/src/totales.ts`, función pura con tests). Todo en céntimos; redondeo
"mitad hacia arriba" una vez por concepto sobre la suma de la cuenta. Los ítems cancelados y los
pedidos sin confirmar no suman. El servicio se calcula siempre sobre la base sin IVA y el IVA no se
cobra sobre el servicio.

- Precios **con IVA incluido** (`preciosIncluyenImpuestos = true`, el default): el precio del menú ya
  trae el IVA y el 10 % de servicio se suma aparte. `base = menú / 1.13`, `IVA = menú − base`,
  `servicio = base × 10%`, `total = menú + servicio`.
  Ej.: ₡4 800 → base ₡4 247,79 · IVA ₡552,21 · servicio ₡424,78 · total ₡5 224,78.
- Precios **sin** impuestos: `servicio = subtotal × 10%`, `IVA = subtotal × 13%`, `total = suma`.

**Horario y promoción** (`PUT /restaurante/horarios`, `PATCH /restaurante`): turnos por día de la
semana (`HorarioRestaurante`, varios por día; si `cierra < abre` el turno pasa de la medianoche) en la
`zonaHoraria` del restaurante (default `America/Costa_Rica`), más `cerradoManual` ("Cerrar
temporalmente"). `estaAbierto()` vive en `packages/shared/src/horario.ts`. El menú público trae
`abierto`, `horarioHoy` y `promocion`. Cerrado → la API rechaza los pedidos de comensales con **423**
`RESTAURANTE_CERRADO` (el mesero sí puede). Sin turnos = siempre abierto. La promoción es un plato
(`platoDestacadoId`) con textos ES/EN y `precioPromo` opcional: si lo tiene, el menú lo muestra y el
servidor **lo cobra** a ese precio.

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

| Rol                    | Rutas                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUPERADMIN             | `POST/GET /admin/restaurantes`, `PATCH /admin/restaurantes/:id` (activo, plan)                                                                                                          |
| DUENO                  | `GET/PATCH /restaurante` (incluye `modoConfirmacion`), `GET /reportes/hoy`                                                                                                              |
| DUENO                  | CRUD `/usuarios` (con `estacionId`), `/estaciones`, `/categorias` (+ `PATCH /orden`), `/mesas`                                                                                          |
| DUENO                  | CRUD `/platos`, `/platos/:platoId/grupos-modificadores[/:grupoId/modificadores]`                                                                                                        |
| DUENO                  | `POST /mesas/:id/regenerar-token`, `GET /mesas/:id/qr?formato=png\|svg`, `POST /uploads/firma` (501)                                                                                    |
| DUENO, MESERO, COCINA  | `GET /platos`, `GET /platos/:id`, `PATCH /platos/:id/agotado`                                                                                                                           |
| DUENO, MESERO, CAJA    | `GET /operacion/mesas`, `GET /operacion/cuentas/:id`, `GET /operacion/llamadas?atendida=`                                                                                               |
| DUENO, MESERO          | `GET /operacion/pedidos?estado=`, `PATCH /operacion/pedidos/:id/confirmar\|cancelar`                                                                                                    |
| DUENO, MESERO          | `POST /operacion/mesas/:id/pedidos`, `GET /operacion/items?estado=LISTO`                                                                                                                |
| DUENO, MESERO          | `PATCH /operacion/items/:id/cancelar`, `PATCH /operacion/llamadas/:id/atender`                                                                                                          |
| DUENO, COCINA          | `GET /operacion/estaciones`, `GET /operacion/estaciones/:id/items`                                                                                                                      |
| DUENO, COCINA, MESERO  | `PATCH /operacion/items/:id/estado` (cocina: preparar/listo de su estación; mesero: entregado)                                                                                          |
| DUENO, CAJA            | `POST /operacion/cuentas/:id/cerrar` `{ metodoPago }`                                                                                                                                   |
| Comensal (sesión)      | `GET /public/cuenta`, `POST /public/cuenta/pedidos`, `POST /public/cuenta/llamar`, `POST /public/cuenta/solicitar`                                                                      |
| Público (rate limited) | `GET /public/:slug/menu`, `GET /public/mesa/:token`, `GET /health`                                                                                                                      |
| DUENO, CAJA            | `POST /operacion/cuentas/:id/pagos` (cuenta separada), `DELETE /operacion/cuentas/:id/pagos/:pagoId`                                                                                    |
| DUENO, COCINA, MESERO  | `POST /operacion/items/:id/deshacer` `{ estado }` (toque equivocado, unos segundos)                                                                                                     |
| DUENO                  | `GET /reportes?desde&hasta`, `/dispositivos` (código, lista, revocar), `PUT /usuarios/:id/pin`, `POST /uploads/imagen?destino=plato`, `logo` o `banner`                                 |
| Comensal (sesión)      | `POST /public/cuenta/personas`, `POST /public/cuenta/ingresos/:id` `{ aceptar }`, `POST /public/cuenta/desbloquear-ingreso`, `POST /public/cuenta/vistas/:platoId`                      |
| Público (rate limited) | `POST /auth/registro`, `POST /public/mesa/:token/ingreso`, `POST /public/mesa/:token/ingreso/:id` `{ clave }`, `POST /dispositivos/vincular`                                            |
| DUENO, CAJA, MESERO    | `GET /enlinea`, `POST /enlinea/:id/aceptar` `{ tiempoEstimadoMin }`, `/rechazar` `{ motivo }`, `/etapa` `{ etapa: LISTO\|EN_CAMINO }`, `/pago-verificado`, `/entregar` `{ metodoPago }` |
| DUENO, CAJA, MESERO    | `GET /enlinea/repartidores`, `POST /enlinea/:id/repartidor` `{ repartidorId }` (a domicilio, aceptado o listo)                                                                          |
| DUENO, CAJA            | `GET /enlinea/efectivo` (efectivo por repartidor sin cuadrar), `POST /enlinea/efectivo/recibir` `{ repartidorId }`                                                                      |
| REPARTIDOR             | `GET /repartos` (sus entregas), `POST /repartos/:id/salir`, `POST /repartos/:id/entregar` `{ metodoPago }`                                                                              |
| DUENO                  | `GET /restaurante/qr-enlinea.png` (QR del enlace /r/:slug; `GET /restaurante` trae `enlaceEnLinea`)                                                                                     |
| Público (rate limited) | `POST /public/:slug/pedidos-en-linea` (10 por IP cada 10 min, máx. 2 pendientes por teléfono), `GET /public/seguimiento/:token`                                                         |

El `restauranteId` de las rutas privadas sale siempre del JWT; si se manda en body o query se ignora.
Rate limit: 1 200 solicitudes/min por IP en `/public` (todos los celulares de un restaurante comparten
la IP del Wi-Fi) y 60/min por sesión de comensal.

### Tiempo real (Socket.IO)

Conectar al host de la API con `auth: { token: <accessToken> }` (personal) o
`auth: { sesion: <token de sesión> }` (comensal). Salas:

| Sala                          | Quién                                                 |
| ----------------------------- | ----------------------------------------------------- |
| `rest:{id}`                   | todo el personal                                      |
| `rest:{id}:meseros` / `:caja` | meseros y dueño / caja y dueño                        |
| `rest:{id}:repartidores`      | repartidores (`reparto:asignado` trae `repartidorId`) |
| `rest:{id}:estacion:{estId}`  | cocina (su estación, o todas si no tiene) y dueño     |
| `rest:{id}:comensales`        | todos los celulares (avisos de menú)                  |
| `cuenta:{cuentaId}`           | celulares de esa mesa (solo su cuenta)                |

Eventos (siempre después del commit; cada uno trae `updatedAt`): `pedido:nuevo`, `pedido:confirmado`
(cada estación recibe solo sus ítems), `pedido:cancelado`, `item:estado`, `mesa:llamada`,
`llamada:atendida`, `cuenta:solicitada`, `cuenta:actualizada`, `cuenta:cerrada`, `menu:actualizado`,
`ping` → `pong`. La base de datos es la fuente de verdad: los clientes usan el evento como aviso y
vuelven a pedir el estado por REST, también en cada reconexión.

## Imágenes

`POST /uploads/imagen?destino=plato|logo` (multipart, campo `imagen`, rol DUENO). Acepta JPG, PNG,
WEBP y HEIC (si el servidor puede decodificarlo; el iPhone suele enviar JPEG) de hasta 8 MB; el tipo
se valida por los bytes del archivo. Con sharp se gira según EXIF, se quitan los metadatos y se
convierte a WebP (calidad 78):

- **plato:** cuadrado centrado de 320 px (`url320` → `fotoMiniUrl`, lista) y 960 px (`url960` →
  `fotoUrl`, detalle), en `restaurantes/{restauranteId}/platos/{uuid}-{tamaño}.webp`.
- **logo:** sin recorte, máximo 512 px (`url` → `logoUrl`).

Al reemplazar o quitar la foto de un plato o el logo se borran los archivos viejos; solo se borran
archivos de la carpeta del propio restaurante. `DELETE /uploads/imagen { url }` borra una imagen
subida y descartada (409 si está en uso).

## Panel del dueño

`http://localhost:5181/panel` (rol DUENO): barra lateral de íconos que se despliega al acercar el cursor en
computadora y menú desplegable (cajón lateral) en el celular. **Inicio** con las ventas de hoy y accesos rápidos; **Menú** con categorías y platos que se
ordenan arrastrando (también con teclado), interruptores de agotado/visible, duplicar y eliminar con
confirmación, y un formulario de plato con foto (subir, arrastrar o tomarla con la cámara), nombres y
descripciones ES/EN, alérgenos, editor de modificadores y vista previa en vivo del celular del cliente.
Cualquier cambio llega al menú del comensal en segundos (`menu:actualizado`).

**Mesas y QR**: crear mesas por rango, activar/desactivar, cambiar el QR de una mesa (el impreso deja
de servir) y descargar el PDF tamaño carta (6 tarjetas por hoja o una por hoja para acrílico).
**Personal**: crear/editar usuarios, rol y estación de cocina, desactivar (no a uno mismo), último
acceso y restablecer contraseña: se muestra una temporal una sola vez y la persona debe cambiarla al
entrar. **Ajustes**: nombre y logo, color del menú (solo colores que contrasten con texto blanco),
idiomas, moneda, impuestos, confirmación de pedidos, promoción, horario por turnos y "Cerrar
temporalmente".

**Dispositivos** (tablets de cocina y bar):

1. En el panel → Dispositivos → "Vincular tablet": nombre y estación → aparece un código de 6
   números que vence en 10 minutos.
2. En la tablet abrir `http://<servidor>:5181/tablet` (o el enlace "¿Es una tablet de cocina?" del
   login) y escribir el código. La tablet guarda un token de dispositivo y queda ligada a esa estación.
3. El personal de cocina entra tocando su nombre y escribiendo su PIN de 4 números (el dueño lo pone
   en Personal → "Poner PIN"). Solo ve los pedidos de la estación de la tablet. La sesión dura 12 h
   y sobrevive a recargar la página.
4. 5 PIN incorrectos bloquean a esa persona 15 minutos (poner un PIN nuevo la desbloquea). Además
   hay límite de intentos por tablet y por IP.
5. "Desvincular" en el panel corta al instante la sesión y el socket de la tablet.

## Reportes

`GET /reportes?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (dueño): días locales del restaurante, ambos
incluidos, máximo un año. Todo se agrega en SQL (30 días ≈ 50 ms). Solo cuentan las cuentas
cerradas; un ítem es "demorado" si queda listo más de 20 min después de confirmado el pedido (el
mismo rojo de la pantalla de cocina). Las vistas de platos se registran de forma anónima, una por
plato y visita, con `POST /public/cuenta/vistas/:platoId`. El CSV se arma en el navegador con los
mismos datos de la pantalla.

## Frontend del comensal

Diseño basado en [`prototipo_front/prototipo-menu.html`](prototipo_front/prototipo-menu.html) y
[`docs/especificacion-frontend-menu.md`](docs/especificacion-frontend-menu.md). Los colores son
variables CSS (`packages/ui/src/tokens.css`; el menú del cliente conserva su morado en `apps/menu/src/index.css`)
con modo claro y oscuro según `prefers-color-scheme`, expuestos a Tailwind 4 con `@theme`. Paleta de grises
cálidos con acento grafito y fuente Plus Jakarta Sans (Fase 6). Responsivo: ocupa toda la pantalla; en el celular navegación abajo y
platos en una columna, en tablet/PC navegación arriba, platos en 2–3 columnas, carrito y cuenta con
los totales a la derecha y el detalle del plato como ventana centrada. Respeta las áreas seguras. PWA básica (`manifest.webmanifest`, sin service worker).

- **Datos:** TanStack Query (mesa, menú, cuenta); al volver a la pestaña o reconectar el socket se
  vuelve a pedir la cuenta. Los eventos con `updatedAt` más viejo que el último visto se ignoran.
- **Carrito e idioma:** Zustand, guardados en localStorage dentro de `try/catch`. Un plato con los
  mismos modificadores y nota se fusiona sumando la cantidad.
- **Envío seguro:** el `clientRequestId` se guarda antes de enviar y se reutiliza en cada
  reintento (1 s, 2 s, 4 s) y al recargar la página; al confirmarse se quita del carrito solo lo
  enviado.
- **Tamaño:** ~174 KB gzip de JS inicial; `socket.io-client` (15 KB) se carga aparte.
- **Tests** (`pnpm --filter menu test`, Vitest + Testing Library + jsdom): validación de
  modificadores en la hoja de detalle, cálculo del carrito, fusión de ítems iguales y reintento con
  el mismo `clientRequestId`.

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

Fase 3: `estaAbierto` (varios turnos, cruce de medianoche, cierre manual), pedido rechazado con 423
fuera de horario, subida de imágenes (tipo falso, tamaño, los 2 tamaños, borrar imágenes ajenas),
PDF de QR solo con mesas propias, reordenar categorías y platos, vinculación de tablets (código
vencido o reutilizado, bloqueo tras 5 PIN, tablet revocada sin socket), reportes (totales iguales a
la suma de las cuentas cerradas del historial del seed, días en hora local, aislamiento) y deshacer
un estado de cocina.

Fase 4: recordatorio de llamada al mesero (y que el spam no suene), aviso agrupado, personas por
mesa (cupo, aceptar/rechazar, sesión entregada una sola vez, bloqueo por rechazos y por spam,
solicitud vencida, otra mesa no puede responder), cuentas separadas (grupos, división de un ítem,
cierre automático con MIXTO, "todo junto" bloqueado, deshacer, aislamiento), registro (slug sin
tildes y único, correo repetido, validación) y personalización (banner 1600×600, enlaces de Google
Maps válidos, datos en el menú público).

Fase 5: pedidos en línea (para recoger y a domicilio, por aceptar aunque el modo sea "nunca", no
entran a cocina ni a la bandeja del mesero hasta aceptarlos, total sin servicio y con envío,
dirección obligatoria a domicilio, "salió a entregar" solo a domicilio, rechazo con motivo,
activo/tipo/horario/mínimo, idempotencia, límite por teléfono, aislamiento, enlace y QR) y
reportes por canal sin contar los rechazados.

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
| `pnpm test`                 | Tests (API, `shared` y `menu`)  |
| `pnpm typecheck`            | `tsc` en todos los paquetes     |
| `pnpm lint` / `pnpm format` | ESLint / Prettier               |

## Fuera de alcance (Fases 5–7)

Pagos con tarjeta en línea o pasarelas, verificación automática de SINPE, rastreo en vivo del
repartidor (GPS), envío calculado por distancia, SMS/WhatsApp automáticos, factura electrónica (los
comprobantes dicen "NO ES FACTURA ELECTRÓNICA"), impresión directa a impresoras térmicas, panel del
superadmin, cobro de mensualidades, despliegue a producción, traducción automática con IA e
inventario.
