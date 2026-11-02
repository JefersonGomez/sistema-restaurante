# CLAUDE.md — Cómo trabajar en este repo

SaaS multi-restaurante de pedidos por QR (Costa Rica). Monorepo pnpm: `apps/api`, `apps/menu`,
`apps/staff`, `packages/shared`.

## Antes de cada tarea

1. Leer `MEMORY.md` (estado actual, decisiones, pendientes).
2. Si la tarea toca alcance, leer la spec de la fase en curso (fuente de verdad):
   `docs/especificacion-fase1.md`, `docs/especificacion-fase2.md`, `docs/especificacion-frontend-menu.md`,
   `docs/especificacion-fase3.md`, `docs/especificacion-fase4.md`, `docs/especificacion-fase5.md`, `docs/especificacion-fase6.md` (hechas) y
   `docs/especificacion-fase7.md` (en curso: domicilio). Backlog: `docs/mejoras-pendientes.md`. Anotar en la spec cada pedido nuevo
   del usuario antes de programarlo.

## Después de cada cambio

- Actualizar `MEMORY.md`: marcar el paso, anotar decisiones nuevas y problemas encontrados.
- Si cambian scripts, variables de entorno, puertos o credenciales → actualizar `README.md`.
- Al reportar al usuario: explicar **qué se hizo en cada archivo** (archivo → cambio), para que
  pueda revisar todo.
- **Antes de cada commit/push: mostrar qué se sube y esperar validación del usuario.** (Fases 3, 4 y
  5: el usuario autorizó commit + push al cerrar cada sub-fase sin esperar.)

## Forma de trabajar

- Trabajar por sub-fases en el orden de `MEMORY.md`. No empezar la siguiente sin aprobación del usuario.
- Al terminar cada sub-fase, verificar (build, `tsc`, migración, tests) y corregir antes de seguir.
  Reportar el resultado real; si algo falla, decirlo con la salida.
- **No agregar librerías fuera del stack sin preguntar.** Stack: Node 20+, TS estricto, pnpm,
  Express, Socket.IO, PostgreSQL 16, Prisma, Zod, JWT, bcrypt, React, Vite, Tailwind, Vitest,
  Supertest, ESLint, Prettier. Las librerías ya aprobadas están listadas en `MEMORY.md`.
- No implementar nada de la sección "Fuera de alcance" de la spec de la fase en curso
  (Fase 7: rastreo en vivo, envío por distancia, rutas optimizadas y lo de su spec; y lo heredado de la Fase 5: pagos con
  tarjeta o pasarelas, verificación automática de SINPE, rastreo GPS, envío por
  distancia, SMS/WhatsApp automáticos, factura electrónica, impresión térmica directa).
- Código mínimo y directo. Sin abstracciones "para después".

## Convenciones de código

- Nombres en español donde la spec los define (modelos, campos, roles, rutas). Resto: español también.
- Comentarios breves y solo donde aporten.
- API: cada módulo `routes → controller → service → Prisma`. La lógica de negocio vive en el service.
  El controller solo lee `req`, llama al service y responde.
- Esquemas Zod en `packages/shared`, reutilizados por API y frontends.
- Montos siempre `Int` en céntimos. Nunca float.
- IDs UUID; `createdAt`/`updatedAt` en todas las tablas.

## Reglas de seguridad (no negociables)

- `restauranteId` sale **solo** del JWT (`req.tenant`). Nunca de body/query/params en rutas privadas.
- Todo service de datos de un restaurante filtra por `restauranteId` (incluido en `where` de
  update/delete: usar `updateMany`/`deleteMany` o verificar pertenencia antes).
- Rutas privadas con `requireRole(...)`. Públicas con rate limit.
- Validar con Zod body, params y query.
- Errores: `{ error: { code, message, details? } }`. Sin stack traces en producción.
- `tokenQr`: `crypto.randomBytes(>=24).toString('base64url')`.
- Credenciales de prueba solo en `seed.ts` y `README.md`.

## Comandos

```
pnpm db:up        # Postgres en Docker
pnpm db:migrate   # prisma migrate dev
pnpm db:seed
pnpm dev          # api + menu + staff
pnpm test
pnpm lint / pnpm format
```

## Entorno

Windows 11, shell PowerShell / Git Bash. Node 22, pnpm 10, Docker 29.
