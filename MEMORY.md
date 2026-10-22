# MEMORY.md — Estado del proyecto

> Leer al inicio de cada sesión. Actualizar después de cada cambio.
> Spec completa: `docs/especificacion-fase1.md`.

## Estado actual

- **Fecha última actualización:** 2026-10-20
- **Fase 1 completa y subida** (commit `a202fd9`).
- **Fase 2 completa y subida** (commit `a0317b7`).
- **Frontend del comensal completo y subido** (commit `5869078`, 2026-10-21).
- **Próxima sesión — pendientes conocidos:** revisión visual del usuario en su celular; el
  frontend del personal (apps/staff) aún usa el estilo básico de la Fase 2 (no el del prototipo);
  sin UI para administrar menú/mesas (solo API); platos sin foto usan el ícono de la categoría.
- Raíz del monorepo: `F:\sistema-restaurante` (equivale a `menu-qr/` de la spec).

## Plan de la Fase 3 (sub-fases) — aprobado 2026-10-22; el usuario autorizó commit + push al cerrar cada sub-fase

Spec: `docs/especificacion-fase3.md`. **Un commit por sub-fase**, validado por el usuario.

| #    | Sub-fase                                                                                               | Estado |
| ---- | ------------------------------------------------------------------------------------------------------ | ------ |
| 3.1  | Tokens compartidos (packages/ui: tokens CSS + componentes del menú reutilizables)                      | ✅     |
| 3.2  | Imágenes: StorageDriver local/R2, POST /uploads/imagen, sharp 320/960 WebP, borrar viejas, logo        | ✅     |
| 3.3  | Horarios por turno, zonaHoraria, cerradoManual, promoción (platoDestacadoId, textos, precioPromo); 423 | ✅     |
| 3.4  | Panel del dueño: layout (sidebar / nav inferior) + Inicio con accesos rápidos                          | ✅     |
| 3.5  | Panel: Menú (categorías/platos, dnd, formulario con cámara, modificadores, vista previa)               | ✅     |
| 3.6  | Panel: Mesas y QR (PDF), Personal (temporal, último acceso), Ajustes (contraste del acento)            | ✅     |
| 3.7  | Dispositivos con PIN (vincular 6 dígitos, token de dispositivo, PIN 4 dígitos, bloqueo, revocar)       | ✅     |
| 3.8  | Reportes agregados en SQL + vistas de platos + recharts + CSV                                          | ⬜     |
| 3.9  | Rediseño de estación, mesero y caja con la identidad visual                                            | ⬜     |
| 3.10 | Tests obligatorios, seed (fotos generadas, horarios, promo, dispositivo, 30 días), README              | ⬜     |

### Decisiones de la Fase 3 (respondidas por el usuario 2026-10-22)

- Promoción: si el plato es el destacado y hay `precioPromo`, el servidor **cobra el precio de promo**.
- Tablets: **PIN por usuario** (4 dígitos, hash); en la tablet se elige el nombre y se pone el PIN.
- Commits: uno por sub-fase; el usuario dijo "ve subiendo todo" → commit y push sin esperar.
- 3.1: `packages/ui` = tokens.css (fuente única de colores/radios/modo oscuro/animaciones; las apps lo
  importan con ruta relativa + `@source` para que Tailwind escanee los componentes), textos es/en,
  util (formatoPrecio, pasoPedido…), componentes del menú (DishSheet, ModifierGroup, QuantityStepper,
  Modal, FotoPlato, DishCard, CategoryGrid, SearchBar, PromoBanner, Header, Pastilla) y `UiProvider`
  (idioma + textos por contexto; el comensal lo alimenta desde Zustand, el personal usa 'es').
- 3.2: `lib/storage.ts` (StorageDriver, LocalDriver, R2Driver; `claveDeUrl` evita salir de la
  carpeta), módulo `uploads` (POST/DELETE /uploads/imagen, multer en memoria 8 MB). Plato tiene
  `fotoUrl` (960) y `fotoMiniUrl` (320, migración `20261022130000_foto_mini`). Se borra solo lo que
  está bajo `restaurantes/{restauranteId}/`. /uploads con `Cross-Origin-Resource-Policy: cross-origin`
  (helmet pone same-origin y el menú está en otro origen). Tests usan UPLOADS_DIR temporal.
  sharp prebuilt NO decodifica HEIC/HEVC → 415 "Súbala en JPG o PNG". Pendiente 3.5: al duplicar un
  plato NO copiar las URLs de foto (borrar una borraría la del otro).
- 3.3: migración `20261022140000_horarios_promocion` (pasa el horario único a 7 turnos y
  Plato.destacado → Restaurante.platoDestacadoId, y borra los campos viejos). `estaAbierto(turnos, ahora,
zona, cerradoManual)` con Intl (sin librerías). Cerrado → 423 (antes 409) solo para CLIENTE; el MESERO
  puede pedir. Promo: el menú público reemplaza `precio` por `precioPromo` y da `precioAntes`; el servidor
  cobra lo mismo (prepararItem). PUT /restaurante/horarios reemplaza todos los turnos. La edición de
  turnos en el panel llega en 3.6.
- 3.4: apps/staff usa TanStack Query (ya aprobada para el proyecto) y UiProvider(es). Panel en
  /panel/* (`panel/PanelLayout.tsx`: barra lateral md+, nav inferior + hoja "Más" en celular),
  `panel/comunes.tsx` (Tarjeta, Boton, Interruptor role=switch, Campo con error, Esqueleto,
  EstadoVacio, ErrorCarga, Etiqueta), `panel/InicioPage.tsx` (indicadores, accesos rápidos, se refresca
  por socket). Se borró DuenoPage: el modo de confirmación vuelve en Ajustes (3.6). /dueno → /panel.
  Login con el estilo nuevo. Secciones aún vacías muestran "En preparación" (componente temporal).
- 3.5: API PATCH /platos/orden, POST /platos/:id/duplicar (copia inactiva y SIN foto), PUT
  /platos/:platoId/grupos-modificadores (upsert: con id actualiza, sin id crea, el resto se borra; ids
  validados contra el plato). `avisarMenu()` emite menu:actualizado en todo cambio de menú (el comensal
  refresca en segundos). Zod en español global (`z.config(z.locales.es())` en shared) + mensajes propios.
  Panel: `panel/menu/` (MenuPanelPage con dnd-kit —sin @dnd-kit/utilities, transform a mano—,
  PlatoForm con subir/arrastrar/"Tomar foto" capture=environment, EditorGrupos, vista previa con
  DishCard/ModifierGroup de @menu-qr/ui en ES/EN, avisos de foto/inglés faltante). Errores Zod por campo
  con `erroresDe`. En la BD de desarrollo quedó un plato de prueba "Casado con pescado" (con foto).
- 3.6: migración `20261022150000_acento_personal` (colorPrimario → colorAcento nullable con refine de
  contraste ≥4.5 contra blanco en `shared/color.ts`; Usuario.debeCambiarPassword y ultimoAcceso). API:
  POST /mesas/lote (salta las que existen), GET /mesas/qr.pdf?ids=&formato=tarjetas|acrilico (pdfkit,
  carta, 6 por hoja o 1), POST /usuarios/:id/restablecer-password (temporal de 10, se muestra una vez),
  POST /auth/cambiar-password. Staff: MesasPage, PersonalPage, AjustesPage (horario por turnos, cerrar
  temporalmente, impuestos, modo de confirmación, logo, acento con vista previa, promoción) y
  CambiarPasswordPage, que bloquea toda la app mientras debeCambiarPassword. El menú del comensal pisa
  --purple/--purple-soft con colorAcento (también en modo oscuro). Quedan "En preparación":
  dispositivos y reportes.
- Pedido del usuario (después de 3.6): el menú del comensal deja la columna de 420 px de la spec del
  frontend y es responsivo (celular / tablet / PC, ver README). El detalle del plato, si el restaurante
  está cerrado, dice "Cerrado" y explica por qué (antes solo se veía el botón apagado). Ojo al probar:
  el horario se evalúa en America/Costa_Rica (Git Bash no tiene esa zona; usar la hora UTC − 6).
- 3.7: migración `20261022160000_dispositivos` (modelo Dispositivo: código de 6 dígitos único con
  vencimiento → al vincular se borra y queda el hash del token; Usuario.pinHash/intentosPin/
  pinBloqueadoHasta). Rutas: dueño GET /dispositivos, POST /dispositivos/codigo, DELETE
  /dispositivos/:id (revoca y `desconectarDispositivo` corta la sala `disp:{id}`), PUT /usuarios/:id/pin
  (null quita; poner PIN desbloquea). Tablet con header `X-Dispositivo`: POST /dispositivos/vincular,
  GET /dispositivos/tablet, POST /dispositivos/tablet/entrar. Solo rol COCINA con PIN y de esa estación
  (o sin estación). La sesión de tablet es un access JWT de 12 h con dispositivoId+estacionId (sin
  refresh); `autenticar` y el socket verifican que el dispositivo siga vigente (1 consulta). En la
  tablet manda la estación del dispositivo (`estacionDe` en operacion.service). Código vencido → 410,
  usado/inexistente → 404; 5 PIN malos → 429 por 15 min. Rate limit: vincular 10 fallidos/15 min por IP;
  PIN 20 fallidos/15 min por tablet. Staff: /tablet (vincular, quién, teclado PIN), panel/Dispositivos
  (código con cuenta regresiva, se refresca cada 3 s mientras espera), PIN en Personal. El token del
  dispositivo y la sesión de la tablet se guardan en localStorage. Seed: Lucía PIN 1234.
- Propuestas sin objeción: HEIC solo si sharp puede leerlo (si no, error claro pidiendo JPG/PNG);
  fotos del seed generadas con sharp; los campos `horaApertura/horaCierre` y `Plato.destacado`
  se reemplazan por `HorarioRestaurante` y `platoDestacadoId` (migrando los datos).

## Plan de la Fase 2 (sub-fases)

Spec: `docs/especificacion-fase2.md`. Un commit por sub-fase, validado por el usuario.

| #    | Sub-fase                                                                                             | Estado |
| ---- | ---------------------------------------------------------------------------------------------------- | ------ |
| 2.1  | Migración: modoConfirmacion, campos de Cuenta/Pedido/PedidoItem, SesionCliente, índice único parcial | ✅     |
| 2.2  | `calcularTotales()` puro en shared + tests unitarios                                                 | ✅     |
| 2.3  | Sesión de cliente y apertura de cuenta (`GET /public/mesa/:token`), concurrencia                     | ✅     |
| 2.4  | Creación de pedidos (cliente y mesero): validaciones, idempotencia, transacción                      | ✅     |
| 2.5  | Confirmación y transiciones (pedido, ítem, cuenta, llamadas) con 409                                 | ✅     |
| 2.6  | Socket.IO: salas por estación/cuenta, auth de comensal, eventos post-commit con `version`            | ✅     |
| 2.7  | Endpoints `/operacion/*` restantes + `/reportes/hoy`                                                 | ✅     |
| 2.8  | Frontend comensal (carrito, modificadores, Mi cuenta, llamar/pedir cuenta, cierre)                   | ✅     |
| 2.9  | Pantalla de estación (tablet)                                                                        | ✅     |
| 2.10 | Pantalla de mesero (celular)                                                                         | ✅     |
| 2.11 | Pantalla de caja (pre-cuenta 80 mm, cerrar)                                                          | ✅     |
| 2.12 | Dueño: Hoy + ajustes de modoConfirmacion                                                             | ✅     |
| 2.13 | Seed con cuentas/pedidos de ejemplo + tests restantes + README de punta a punta                      | ✅     |
| 2.14 | Script `simular-hora-pico.ts`                                                                        | ✅     |

### Decisiones de la Fase 2 (respondidas por el usuario 2026-10-21)

- `preciosIncluyenImpuestos = true` → el precio del menú incluye **IVA y servicio** (es lo que paga
  el cliente). Se desglosa hacia atrás: base = total / (1 + IVA% + servicio%).
- El IVA **no** se cobra sobre el servicio: IVA y servicio se calculan ambos sobre la base.
- `Usuario.estacionId` opcional: un COCINA con estación solo ve y opera esa estación; vacío = todas.
- `socket.io-client` aprobado para apps/menu y apps/staff.
- Propuestas (sin objeción aún): rate limit por sesión de comensal además de IP; mesa "ocupada"
  solo si su cuenta tiene pedidos o llamadas; con PRIMER_PEDIDO la cuenta se verifica al confirmar el
  primer pedido o cuando el mesero toma uno; tiempo de preparación = EN_PREPARACION→LISTO;
  "hoy" en America/Costa_Rica (UTC−6); sala `rest:{id}:comensales` para `menu:actualizado`;
  clientRequestId con `crypto.getRandomValues` (randomUUID no existe en http por LAN).

### Decisiones del frontend del comensal (respondidas por el usuario 2026-10-21)

- **Cambio de regla de impuestos:** `preciosIncluyenImpuestos = true` ahora significa que el precio
  del menú incluye **solo el IVA**; el 10 % de servicio se **suma** y se calcula sobre la base sin IVA.
  (Reemplaza la decisión de la Fase 2 de "IVA y servicio incluidos".) ₡4 800 → total ₡5 224,78.
- Horario: `Restaurante.horaApertura/horaCierre` ("HH:MM", hora CR; null = siempre abierto),
  `estaAbierto()` en `shared/horario.ts`; el menú público trae `abierto`; pedidos de CLIENTE fuera
  de horario → 409 `RESTAURANTE_CERRADO` (el mesero sí puede). El dueño lo edita en "Hoy".
- `Plato.destacado` (banner) y `Categoria.icono` (emoji). Migración `20261022120000_menu_horario_destacado`.
- React 19 (no 18). Tailwind 4: tokens en `@theme inline` de `index.css`, no `tailwind.config`.
- Librerías nuevas en apps/menu: `@tanstack/react-query`, `zustand`, `lucide-react`; dev:
  `vitest`, `@testing-library/react|user-event|jest-dom`, `jsdom`.
- Estructura: `componentes/` (estructura, menu, detalle, cuenta), `pantallas/`, `datos/` (mesa.tsx =
  consultas + socket, envio.ts, acciones.ts), `estado/` (carrito, idioma, avisos), `textos/` (es, en).
- Al confirmarse un envío se quita del carrito solo lo enviado (`restar`), no lo agregado después.
- Platos sin foto muestran el ícono de su categoría (el prototipo usa un emoji por plato).
- `socket.io-client` se importa dinámicamente (JS inicial 174 KB gzip).
- Verificación visual con `playwright-core` + Edge instalado (en el scratchpad, no en el repo).

### Decisiones técnicas de la Fase 2

- Migración `20261021120000_fase2_operacion`: el SQL se generó con `prisma migrate diff`
  (`migrate dev` no corre en terminal no interactiva) + índice parcial `cuenta_unica_abierta`
  (`UNIQUE (mesaId) WHERE estado <> CERRADA`) agregado a mano. Prisma lo ignora (no hay drift).
  Se agregó `Pedido.confirmadoEn` (no está en la spec) para el temporizador de cocina.
- Concurrencia: `bloquearCuenta(tx)` = `SELECT … FOR UPDATE` sobre la cuenta en toda transacción
  que crea pedidos, cambia totales o cierra. `obtenerOCrearCuenta` atrapa P2002 del índice parcial
  y devuelve la ganadora. Idempotencia: `@@unique([cuentaId, clientRequestId])` + búsqueda previa +
  P2002 → devolver el existente (200; creado → 201).
- Transiciones de ítem con `updateMany` condicionado al estado anterior (evita dobles toques).
- Totales: solo pedidos CONFIRMADOS y sin ítems cancelados; se guardan en la cuenta
  (`recalcularCuenta`). Pedidos PENDIENTES no suman; no se cierra una cuenta con PENDIENTES (409
  `PEDIDOS_PENDIENTES`). Pedir más con la cuenta en PIDIO_CUENTA está permitido.
- Errores nuevos: 409 `PLATO_NO_DISPONIBLE` (motivo agotado/no_disponible), 400
  `MODIFICADORES_INVALIDOS`, 409 `TRANSICION_INVALIDA`, 410 `CUENTA_CERRADA`, 401 `SESION_EXPIRADA`.
- Forma única de respuesta de cuentas/pedidos/ítems: `modules/pedidos/detalle.ts` (`aCuenta`,
  `aPedido`, `aItem`), tipos `CuentaDetalle` etc. en shared. Eventos en `modules/pedidos/eventos.ts`.
- Endpoints extra (no en la spec, necesarios para las pantallas): `GET /operacion/estaciones`,
  `GET /operacion/items?estado=LISTO`, evento `llamada:atendida`.
- `shared` exporta subrutas `@menu-qr/shared/totales` y `/seleccion` para que los frontends no
  empaqueten zod. `seleccion.ts`: `minimoEfectivo`, `grupoCompleto`, `seleccionValida`,
  `precioConModificadores` (los usa también la API).
- Frontends: el socket solo avisa → refrescar por REST (agrupado 150 ms); al (re)conectar, al volver
  `online` y al volver la pestaña visible se resincroniza. Staff: `api()` refresca el access token
  ante 401 (un solo refresh a la vez) y el socket usa `auth` como función.
- Comensal: sesión, carrito y envío pendiente en localStorage (try/catch). El `clientRequestId` se
  guarda antes de enviar; reintentos con backoff 1/2/4 s y reintento automático al recargar.
- Estación: umbrales 10/20 min en `EstacionPage.tsx`; sonido con Web Audio API; Wake Lock.
- Seed: ejemplos en mesas 1, 2, 4, 5 y 6 (mesa 3 libre). Simulador: restaurante `sim-hora-pico-…`
  que queda `activo=false` (se acumulan en la BD de desarrollo; borrarlos con un reset).

## Plan de la Fase 1 (sub-fases) — completa

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
- `prisma migrate reset` está bloqueado para agentes sin consentimiento explícito del usuario
  (variable PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION). Para probar el seed usar una BD temporal.
- Cambiar la regla de impuestos NO recalcula los totales guardados de cuentas abiertas: hubo que
  correr `recalcularCuenta` a mano en la BD de desarrollo. Si se cambia en producción, hacer lo mismo.
- jsdom reporta `navigator.language = en-US`: los tests de componentes fijan `useIdioma` en 'es'.
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
- 2026-10-21: Fase 2 completa (2.1–2.14): migración, totales, sesión de comensal, pedidos,
  transiciones, Socket.IO por estación/cuenta, /operacion, /reportes/hoy, pantallas de comensal,
  cocina, mesero, caja y dueño, seed con ejemplos, tests (72 API + 9 shared) y simulador de hora pico.
- 2026-10-21: Fase 2 subida (a0317b7). BD de desarrollo reiniciada con consentimiento del usuario.
- 2026-10-21: frontend del comensal según prototipo (claro/oscuro, PWA), nueva regla de impuestos,
  horario/destacado/ícono (migración), tests: shared 15, API 74, menu 16. Recorrido en vivo en el
  navegador OK (pedido, estado en vivo, agotado sin recargar, pantalla de agradecimiento).
- 2026-10-22: revisión previa a Fase 3 en el navegador (app del personal): cocina sin estación
  asignada abría en "Bar" vacía → opción "Todas" (por defecto) que junta ítems de todas las
  estaciones; estados con tildes en mesero; columnas de la tabla de caja; encabezado compacto en
  celular. Spec de la Fase 3 guardada en docs/especificacion-fase3.md.
