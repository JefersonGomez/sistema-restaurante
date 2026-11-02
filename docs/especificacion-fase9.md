# Fase 9 — Panel del superadmin, planes y recuperar contraseña

Fuente de verdad del alcance de la Fase 9. Decisiones del usuario (2026-11-01):

- El superadmin es el usuario (su correo personal; se crea con `pnpm --filter api superadmin`).
- **Registro abierto** con **primer mes gratis**; **sin "entrar como"** un restaurante.
- **Planes:** **Básico ₡9 900/mes** (menú QR, pedidos en mesa, cocina, caja, reportes) y **Completo
  ₡19 900/mes** (además: pedidos en línea, domicilio con repartidores, clientes y tarjeta de
  sellos). **Anual con 2 meses gratis** (₡99 000 / ₡199 000).
- Cobro **a mano** (SINPE o transferencia): el superadmin registra cada pago.
- Correos con **Resend** (API por `fetch`, sin librería). El diseño de la landing de planes lo
  manda el usuario después (no es parte de esta fase).

## Planes y suscripción

- Un restaurante que se registra empieza en **Completo, en prueba por 30 días**.
- Cada restaurante tiene **plan** y **vence el**. Estado calculado: **En prueba** (nunca pagó y no
  ha vencido), **Al día**, **Por vencer** (7 días o menos), **Vencido**, **Suspendido** (el
  superadmin lo desactivó: nadie del restaurante entra y su menú no abre).
- Registrar un pago: plan, meses (1–24), monto (sugerido según el plan; anual = 10 meses), método
  (SINPE, transferencia, efectivo, otro) y referencia. El vencimiento se corre desde la fecha
  mayor entre hoy y el vencimiento actual.
- **Vencido no se suspende solo** (decisión para no cortarle el servicio a un restaurante por un
  pago atrasado de un día): el dueño ve un aviso en su panel y el superadmin decide suspender.
- **Funciones por plan:** el plan Básico no tiene pedidos en línea, repartidores, clientes ni
  sellos: la API responde 403 `PLAN_NO_INCLUYE` y el menú en línea no se abre; el panel del dueño
  esconde esas secciones y en Ajustes dice que vienen con el plan Completo.
- El dueño ve en su panel su plan, cuándo vence y un aviso cuando está en prueba, por vencer o
  vencido (con el contacto de soporte si está configurado `SOPORTE_WHATSAPP`).

## Panel del superadmin (`/admin`)

- **Resumen:** restaurantes (activos, en prueba, al día, por vencer, vencidos, suspendidos),
  ingresos del mes (pagos registrados) e ingreso mensual recurrente estimado.
- **Restaurantes:** buscar por nombre, slug o correo del dueño y filtrar por estado; cada fila con
  dueño, plan, vencimiento, estado, pedidos de los últimos 30 días y fecha de registro.
- **Detalle:** datos y dueño, cambiar plan, registrar pago, historial de pagos, suspender /
  reactivar y **restablecer la contraseña del dueño** (temporal, se muestra una sola vez y debe
  cambiarla al entrar).

## Recuperar contraseña por correo

- Personal (login del panel) y clientes del menú en línea: "¿Olvidó su contraseña?" → correo →
  enlace de un solo uso que vence en 1 hora → nueva contraseña. Al cambiarla se cierran las
  sesiones abiertas.
- La respuesta es la misma exista o no el correo (no revela quién tiene cuenta); límite por IP.
- Sin `RESEND_API_KEY` (desarrollo) el correo se escribe en la consola de la API.

## Fuera de alcance

"Entrar como" un restaurante, cobro automático con tarjeta, facturas electrónicas de la
mensualidad, landing de planes (diseño pendiente del usuario), varias sucursales por cuenta.

## Plan (sub-fases)

1. **9.1 Planes y suscripción (API):** plan como enum, vencimiento, pagos, funciones por plan,
   API del superadmin, tests.
2. **9.2 Pantallas:** panel `/admin`, aviso del plan en el panel del dueño, secciones según plan.
3. **9.3 Recuperar contraseña** (Resend) para personal y clientes, con tests.
4. **9.4 Cierre:** seed, README, variables de entorno, verificación.
