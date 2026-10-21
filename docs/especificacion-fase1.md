# Proyecto: Sistema de pedidos QR para restaurantes (Costa Rica) — Fase 1

> Especificación original entregada por el usuario. Es la fuente de verdad del alcance.
> No editar salvo que el usuario cambie requisitos (y anotarlo en MEMORY.md).

## Contexto
Estamos construyendo un SaaS multi-restaurante. Los comensales escanean un QR en su mesa,
ven el menú en su celular (español/inglés) y hacen pedidos que llegan en tiempo real a cocina,
bar y meseros. Cada restaurante paga una mensualidad. Una sola instancia de la app sirve a
todos los restaurantes (multi-tenant), y ningún restaurante puede ver datos de otro.

En esta Fase 1 vamos a construir SOLO la base: monorepo, base de datos, autenticación,
administración del menú y mesas, el menú público de solo lectura y el esqueleto de tiempo real.

## Stack (no cambiar)
- Node.js 20+ y TypeScript estricto en todo el proyecto
- Monorepo con pnpm workspaces
- API: Express + Socket.IO
- Base de datos: PostgreSQL 16 con Prisma ORM
- Validación: Zod (esquemas compartidos entre front y back)
- Auth: JWT (access token corto + refresh token) y bcrypt
- Frontends: React + Vite + TypeScript + Tailwind (solo el andamiaje en esta fase)
- Tests: Vitest + Supertest
- Calidad: ESLint + Prettier
- Desarrollo local: Docker Compose solo para PostgreSQL

## Estructura del monorepo
```
menu-qr/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/        # auth, restaurantes, menu, mesas, public
│   │   │   ├── realtime/       # Socket.IO
│   │   │   ├── middlewares/    # auth, roles, tenant, validate, errorHandler
│   │   │   ├── lib/            # prisma, logger, env, tokens
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── tests/
│   ├── menu/                   # React: vista del comensal (andamiaje)
│   └── staff/                  # React: personal y dueño (andamiaje)
├── packages/
│   └── shared/                 # tipos y esquemas Zod compartidos
├── docker-compose.yml
├── .env.example
└── README.md
```

Cada módulo de la API sigue el patrón: routes → controller → service → Prisma.
La lógica de negocio vive en los services.

## Modelo de datos (Prisma)
Usar UUID como id, `createdAt` y `updatedAt` en todas las tablas.
Los montos se guardan como enteros en céntimos (Int), nunca como float.

- Restaurante: nombre, slug (único), logoUrl, colorPrimario, moneda (CRC | USD),
  idiomas (es, en), porcentajeIva (default 13), porcentajeServicio (default 10),
  preciosIncluyenImpuestos (bool), activo, plan
- Usuario: restauranteId (nullable solo para SUPERADMIN), nombre, email (único),
  passwordHash, rol (SUPERADMIN | DUENO | MESERO | COCINA | CAJA), activo
- RefreshToken: usuarioId, tokenHash, expiraEn, revocado
- Estacion: restauranteId, nombre (ej. Cocina, Bar)
- Mesa: restauranteId, numero, nombre opcional, tokenQr (aleatorio, largo, único), activa
- Categoria: restauranteId, nombreEs, nombreEn, orden, activa
- Plato: restauranteId, categoriaId, estacionId, nombreEs, nombreEn, descripcionEs,
  descripcionEn, precio (Int céntimos), fotoUrl, agotado, activo, orden, alergenos (string[])
- GrupoModificadores: platoId, nombreEs, nombreEn, obligatorio, minimo, maximo
  (ej. "Término de la carne", obligatorio, min 1, max 1)
- Modificador: grupoId, nombreEs, nombreEn, precioExtra (Int céntimos)

Crear también (sin endpoints todavía, se usan en la Fase 2):
- Cuenta: restauranteId, mesaId, estado (ABIERTA | PIDIO_CUENTA | CERRADA), abiertaEn, cerradaEn
- Pedido: restauranteId, cuentaId, estado (PENDIENTE | CONFIRMADO | CANCELADO),
  confirmadoPorId, nota
- PedidoItem: pedidoId, platoId, estacionId, cantidad, notas, precioUnitario
  (copia del precio al momento del pedido), estado (PENDIENTE | EN_PREPARACION | LISTO | ENTREGADO)
- PedidoItemModificador: pedidoItemId, modificadorId, nombre y precioExtra copiados
- Llamada: restauranteId, mesaId, tipo (MESERO | CUENTA), atendida

Todas las tablas que pertenecen a un restaurante llevan `restauranteId` con índice.

## Reglas de seguridad y multi-tenant (críticas)
1. El middleware `tenant` obtiene el restauranteId SOLO del JWT. Nunca aceptarlo
   desde el body, query o params en rutas privadas.
2. Todo service que lea o escriba datos de un restaurante debe filtrar por restauranteId.
3. Middleware `requireRole(...roles)` para proteger rutas.
4. Rutas públicas protegidas con rate limiting (express-rate-limit).
5. Helmet, CORS solo para los orígenes definidos en .env.
6. Validar con Zod todo body, params y query.
7. Errores con formato uniforme: { error: { code, message, details? } }.
   Nunca exponer stack traces en producción.
8. tokenQr generado con crypto.randomBytes (mínimo 24 bytes, base64url).

## Endpoints de la Fase 1

Auth
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- GET  /auth/me

Superadmin
- POST /admin/restaurantes      (crea restaurante + usuario dueño)
- GET  /admin/restaurantes
- PATCH /admin/restaurantes/:id (activar/desactivar, plan)

Dueño (rol DUENO)
- GET/PATCH /restaurante                 (configuración propia)
- CRUD /usuarios                         (personal de su restaurante)
- CRUD /estaciones
- CRUD /categorias  + PATCH /categorias/orden
- CRUD /platos      + PATCH /platos/:id/agotado (también permitido para MESERO y COCINA)
- CRUD /platos/:id/grupos-modificadores y sus modificadores
- CRUD /mesas
- POST /mesas/:id/regenerar-token
- GET  /mesas/:id/qr?formato=png|svg     (usar la librería `qrcode`;
       el QR apunta a ${MENU_PUBLIC_URL}/m/${tokenQr})
- POST /uploads/firma                    (por ahora devolver 501 con un TODO;
       el almacenamiento de imágenes se hace luego con Cloudflare R2)

Público (sin login)
- GET /public/:slug/menu   → restaurante, categorías activas y platos activos con
  modificadores; los platos agotados vienen marcados, no ocultos
- GET /public/mesa/:token  → valida la mesa y devuelve slug del restaurante y número de mesa
  (todavía NO abre cuenta; eso es Fase 2)

Salud
- GET /health

## Tiempo real (solo esqueleto)
- Socket.IO montado sobre el mismo servidor HTTP.
- Autenticación en el handshake con el JWT del personal.
- Al conectar, unir el socket a salas según rol:
  rest:{id}:cocina, rest:{id}:bar, rest:{id}:meseros, rest:{id}:caja.
- Crear un helper `emitToRestaurant(restauranteId, sala, evento, payload)` para usar en la Fase 2.
- Un evento de prueba `ping` → `pong`.
- Cuando se marque un plato como agotado, emitir `menu:actualizado` a todo el restaurante.

## Frontends (solo andamiaje)
- apps/menu: proyecto Vite + React + Tailwind que en /m/:token llama a
  /public/mesa/:token y luego a /public/:slug/menu, y muestra el menú agrupado por
  categoría con selector de idioma ES/EN. Diseño mobile-first, simple y limpio.
- apps/staff: proyecto Vite + React + Tailwind con pantalla de login funcional
  y una página vacía por rol. Nada más.

## Datos de prueba (seed)
- 1 superadmin
- 1 restaurante demo "Soda La Esquina" (slug: soda-la-esquina) con dueño, un mesero,
  un usuario de cocina y uno de caja
- Estaciones: Cocina y Bar
- 4 categorías y 12 platos ticos realistas (casado, gallo pinto, chifrijo, arroz con
  pollo, olla de carne, refrescos naturales, café, etc.) con precios en colones
  y traducción al inglés
- Al menos 1 plato con grupo de modificadores obligatorio
- 8 mesas
- Las credenciales de prueba van en el seed y en el README, no en el código de la app

## Tests mínimos
- Login correcto e incorrecto
- Rutas protegidas devuelven 401 sin token y 403 con rol incorrecto
- AISLAMIENTO: un dueño del restaurante A no puede leer ni modificar platos,
  mesas ni categorías del restaurante B (este test es obligatorio)
- GET /public/:slug/menu no devuelve platos inactivos ni datos de otro restaurante

## Scripts (raíz)
- pnpm dev          → levanta api, menu y staff en paralelo
- pnpm db:up        → docker compose up postgres
- pnpm db:migrate   → prisma migrate dev
- pnpm db:seed
- pnpm test
- pnpm lint / pnpm format

## Fuera de alcance en esta fase (NO implementar)
Crear pedidos, abrir/cerrar cuentas, pantallas de cocina/mesero/caja, pagos,
facturación electrónica, impresión de comandas, reportes, subida real de imágenes, despliegue.

## Forma de trabajar
1. Antes de escribir código, muéstrame un plan breve con los pasos y espera mi aprobación.
2. Implementa por pasos en este orden: monorepo y tooling → Docker + Prisma + migración
   → seed → auth → middlewares → módulos del dueño → público → Socket.IO → frontends → tests.
3. Al final de cada paso, ejecuta lo necesario para comprobar que funciona
   (build, migración, tests) y corrige errores antes de seguir.
4. No agregues librerías fuera del stack sin preguntarme.
5. Código y nombres de variables en español donde ya están definidos en este documento;
   comentarios breves y solo donde aporten.

## Criterios de aceptación
- `pnpm install && pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev` funciona
  desde cero siguiendo el README.
- Puedo hacer login como dueño, crear un plato y verlo en el menú público.
- Abro http://localhost:<puerto>/m/<token-de-una-mesa> y veo el menú de la Soda La Esquina
  en español e inglés.
- Todos los tests pasan, incluido el de aislamiento entre restaurantes.
- README con: requisitos, instalación, variables de entorno, credenciales de prueba
  y cómo correr los tests.
