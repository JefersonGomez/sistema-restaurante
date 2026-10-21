# Proyecto: Sistema de pedidos QR para restaurantes (Costa Rica) — Fase 2

> Especificación original entregada por el usuario. Es la fuente de verdad del alcance de la Fase 2.
> No editar salvo que el usuario cambie requisitos (y anotarlo en MEMORY.md).

## Contexto
La Fase 1 ya está completa: monorepo, Prisma, auth con JWT y roles, multi-tenant,
administración del menú y mesas, menú público de solo lectura y esqueleto de Socket.IO.
Lee el código existente y el README antes de empezar, y respeta la estructura,
el patrón routes → controller → service → Prisma y las reglas de seguridad ya implementadas.

En esta Fase 2 construimos el corazón del producto: el comensal pide desde la mesa y
los pedidos llegan en tiempo real a cocina, bar, meseros y caja.

## Stack
El mismo de la Fase 1. No agregar librerías nuevas sin preguntarme, excepto:
- `nanoid` o `crypto` para tokens si hace falta
- `howler` NO; usar la Web Audio API o un <audio> simple para sonidos

## Flujo completo a implementar

1. El comensal escanea el QR → abre /m/:token
2. La API valida la mesa y obtiene o crea la cuenta ABIERTA de esa mesa,
   y entrega al comensal un token de sesión de cliente ligado a esa cuenta
3. El comensal arma su carrito (con modificadores y notas) y envía el pedido
4. Según la configuración del restaurante, el pedido queda PENDIENTE de confirmación
   del mesero o pasa directo a CONFIRMADO
5. Al confirmarse, cada ítem se envía a la pantalla de su estación (cocina o bar)
6. La estación cambia el estado de cada ítem: EN_PREPARACION → LISTO
7. El mesero ve los ítems LISTOS y los marca ENTREGADO
8. El comensal ve el estado de sus pedidos en vivo, puede pedir más, llamar al mesero
   o pedir la cuenta
9. Caja ve la cuenta con el desglose, registra el método de pago y la CIERRA
10. Al cerrar la cuenta, la sesión del comensal deja de servir y la mesa queda libre

## Cambios al modelo de datos (nueva migración)
- Restaurante.modoConfirmacion: SIEMPRE | PRIMER_PEDIDO | NUNCA (default PRIMER_PEDIDO)
  - SIEMPRE: cada pedido de un comensal requiere confirmación del mesero
  - PRIMER_PEDIDO: solo el primer pedido de la cuenta; luego la cuenta queda verificada
  - NUNCA: todo pasa directo a cocina
- Cuenta: agregar `verificada` (bool), `subtotal`, `montoServicio`, `montoIva`, `total`
  (Int céntimos, se recalculan en el servidor), `metodoPago` (EFECTIVO | TARJETA | SINPE | MIXTO,
  nullable), `cerradaPorId`, `numeroComensales` opcional
- Pedido: agregar `origen` (CLIENTE | MESERO), `clientRequestId` (string, único por cuenta,
  para idempotencia), `creadoPorUsuarioId` nullable
- PedidoItem: agregar `motivoCancelacion` nullable, `cancelado` (bool), timestamps
  `enPreparacionEn`, `listoEn`, `entregadoEn`
- SesionCliente: cuentaId, tokenHash, creadaEn, expiraEn, revocada
- Restricción: solo puede existir UNA cuenta con estado distinto de CERRADA por mesa.
  Implementarlo con un índice único parcial en SQL dentro de la migración.

## Reglas de negocio (críticas)

Precios y totales
- El servidor calcula TODOS los precios. Nunca confiar en precios que vengan del cliente.
- precioUnitario del ítem = precio del plato + suma de precioExtra de modificadores,
  copiado al momento del pedido.
- Cálculo de la cuenta según la configuración del restaurante
  (porcentajeServicio, porcentajeIva, preciosIncluyenImpuestos).
  Todo en enteros (céntimos) con redondeo explícito y documentado.
  Poner esta lógica en una función pura en packages/shared con tests unitarios.
- Los ítems cancelados no suman.

Validaciones al crear un pedido
- La mesa y la cuenta pertenecen al mismo restaurante y la cuenta no está CERRADA
- Cada plato existe, está activo, no está agotado y pertenece a ese restaurante
- Los modificadores pertenecen al plato y cumplen obligatorio/mínimo/máximo de su grupo
- Cantidad entre 1 y 20; notas máximo 200 caracteres; máximo 30 ítems por pedido
- Idempotencia: si llega el mismo clientRequestId para la misma cuenta, devolver el
  pedido ya creado en lugar de duplicarlo
- Todo dentro de una transacción de Prisma

Transiciones de estado válidas (rechazar cualquier otra con 409)
- Pedido: PENDIENTE → CONFIRMADO | CANCELADO
- PedidoItem: PENDIENTE → EN_PREPARACION → LISTO → ENTREGADO
  (se puede cancelar mientras no esté LISTO; requiere motivo)
- Cuenta: ABIERTA → PIDIO_CUENTA → CERRADA (ABIERTA → CERRADA también permitido para caja)

Permisos
- COCINA: cambiar estado de ítems de su estación (EN_PREPARACION, LISTO), marcar platos agotados
- MESERO: confirmar/cancelar pedidos, crear pedidos para una mesa (origen MESERO, se
  confirman automáticamente), marcar ítems ENTREGADO, atender llamadas, cancelar ítems
- CAJA: ver cuentas, registrar método de pago, cerrar cuentas
- DUENO: todo lo anterior

Sesión del comensal
- GET /public/mesa/:token obtiene o crea la cuenta abierta y devuelve un token de sesión
  de cliente (aleatorio, guardado hasheado). Vence a las 6 horas o al cerrar la cuenta.
- Varios celulares en la misma mesa comparten la misma cuenta, cada uno con su sesión.
- Toda ruta pública de pedidos exige ese token en el header Authorization.
- Si la cuenta se cerró, responder 410 para que el frontend muestre "Gracias por su visita".

## Endpoints nuevos

Público (comensal, con token de sesión de cliente)
- GET  /public/mesa/:token                → (modificado) abre/obtiene cuenta y entrega sesión
- POST /public/cuenta/pedidos              → crear pedido (con clientRequestId)
- GET  /public/cuenta                      → pedidos de la cuenta con estado de cada ítem y totales
- POST /public/cuenta/llamar               → { tipo: MESERO }
- POST /public/cuenta/solicitar            → pide la cuenta (estado PIDIO_CUENTA + llamada tipo CUENTA)

Personal (JWT + roles)
- GET   /operacion/mesas                   → todas las mesas con estado (libre, ocupada,
                                             pedido pendiente, pidió cuenta, llamada activa)
- GET   /operacion/cuentas/:id             → detalle completo con totales
- GET   /operacion/pedidos?estado=PENDIENTE
- PATCH /operacion/pedidos/:id/confirmar
- PATCH /operacion/pedidos/:id/cancelar    → { motivo }
- POST  /operacion/mesas/:id/pedidos       → pedido creado por el mesero
- GET   /operacion/estaciones/:id/items    → ítems activos de la estación (PENDIENTE,
                                             EN_PREPARACION, LISTO) agrupados por pedido y mesa
- PATCH /operacion/items/:id/estado        → { estado }
- PATCH /operacion/items/:id/cancelar      → { motivo }
- GET   /operacion/llamadas?atendida=false
- PATCH /operacion/llamadas/:id/atender
- POST  /operacion/cuentas/:id/cerrar      → { metodoPago }
- GET   /reportes/hoy                      → total vendido, cuentas cerradas, ticket promedio,
                                             top 10 platos, tiempo promedio de preparación

## Tiempo real (Socket.IO)

Salas
- rest:{id}:estacion:{estacionId}   → pantallas de cocina y bar
- rest:{id}:meseros
- rest:{id}:caja
- cuenta:{cuentaId}                 → celulares de los comensales de esa mesa

Autenticación del socket
- Personal: JWT (ya existe). Unir a salas según rol y estaciones.
- Comensal: token de sesión de cliente. Solo puede unirse a su sala cuenta:{id}.

Eventos (emitir SIEMPRE después de que la transacción se confirme en la base de datos)
- pedido:nuevo          → meseros (si está PENDIENTE)
- pedido:confirmado     → estaciones correspondientes (solo sus ítems), meseros, cuenta
- pedido:cancelado      → meseros, cuenta
- item:estado           → estación, meseros, cuenta
- mesa:llamada          → meseros
- cuenta:solicitada     → meseros, caja
- cuenta:actualizada    → cuenta, caja (cambian totales)
- cuenta:cerrada        → cuenta, meseros, caja
- menu:actualizado      → todo el restaurante y los comensales conectados

Regla de oro: la base de datos es la fuente de verdad; el socket solo avisa.
Al reconectarse, todo cliente vuelve a pedir su estado por REST.
Incluir en cada evento un `version` o `updatedAt` para que el frontend ignore eventos viejos.

## Frontend del comensal (apps/menu)
- Guardar el token de sesión y el carrito en localStorage dentro de try/catch;
  la app debe funcionar aunque localStorage falle
- Ficha de plato con foto, descripción, selector de modificadores que respeta
  obligatorio/mín/máx, notas y cantidad
- Platos agotados visibles pero deshabilitados
- Carrito con resumen y total estimado (el total real lo da el servidor)
- Botón "Enviar pedido" que genera un clientRequestId (uuid), se deshabilita mientras
  envía y reintenta de forma segura si falla la red
- Pantalla "Mi cuenta": pedidos con estado de cada ítem en vivo, desglose
  (subtotal, servicio, IVA, total)
- Botones flotantes "Llamar al mesero" y "Pedir la cuenta" con confirmación
- Mensaje claro cuando el pedido espera confirmación del mesero
- Pantalla final cuando la cuenta se cierra
- Todo en español e inglés; mobile-first; debe cargar rápido con señal débil

## Frontend del personal (apps/staff)

Pantalla de estación (cocina / bar) — pensada para tablet en horizontal
- Tarjetas por pedido con número de mesa, hora, ítems, modificadores y notas resaltadas
- Tocar un ítem: PENDIENTE → EN_PREPARACION → LISTO
- Temporizador por pedido; amarillo a los 10 min y rojo a los 20 min (configurable en código)
- Sonido fuerte al llegar un pedido nuevo (el usuario debe tocar "Activar sonido" una vez
  al abrir, por las reglas de los navegadores)
- Mantener la pantalla encendida con la Screen Wake Lock API cuando esté disponible
- Indicador visible de conexión (conectado / reconectando) y resincronización automática
- Botón rápido para marcar platos como agotados

Pantalla de mesero — pensada para celular
- Cuadrícula de mesas con colores por estado
- Bandeja de pendientes: pedidos por confirmar, llamadas y cuentas solicitadas
- Lista de ítems LISTOS para llevar, con botón "Entregado"
- Tomar pedido para una mesa usando el mismo catálogo
- Vibración (navigator.vibrate) y sonido al llegar algo nuevo

Pantalla de caja — pensada para computadora
- Lista de cuentas abiertas, primero las que pidieron cobrar
- Detalle con desglose y botón "Imprimir pre-cuenta" (window.print con CSS de ticket
  de 80 mm; dejar claro en el ticket que NO es factura electrónica)
- Seleccionar método de pago y cerrar cuenta

Dueño
- Página simple de "Hoy" con los datos de /reportes/hoy
- Configurar modoConfirmacion en ajustes

## Tests obligatorios
- Cálculo de totales: con y sin impuestos incluidos, con servicio, con ítems cancelados
  y casos de redondeo (función pura)
- Validación de modificadores obligatorios, mínimos y máximos
- No se puede pedir un plato agotado, inactivo o de otro restaurante
- No se puede pedir sobre una cuenta CERRADA (410)
- Idempotencia: el mismo clientRequestId no duplica el pedido
- Transiciones de estado inválidas devuelven 409
- Solo puede haber una cuenta abierta por mesa, incluso con dos solicitudes simultáneas
- Aislamiento: personal del restaurante A no ve ni modifica pedidos o cuentas de B
- Un comensal no puede ver ni pedir en otra cuenta con su token
- Permisos por rol en las rutas de /operacion
- Socket: un pedido confirmado emite el evento solo a la sala de su estación

## Prueba de carga
Crear un script en apps/api/scripts/simular-hora-pico.ts que, contra el entorno local,
abra 20 mesas y envíe pedidos aleatorios durante 5 minutos con varios clientes de socket
escuchando. Reportar latencia promedio y máxima de creación de pedidos y de llegada de
eventos, y confirmar que no se perdió ni duplicó ningún pedido.

## Fuera de alcance (NO implementar)
Pagos en línea, integración con SINPE o pasarelas, facturación electrónica de Hacienda,
impresión directa a impresoras térmicas, notificaciones push, modo offline completo,
dividir la cuenta por persona, reservas, reportes avanzados, despliegue.

## Forma de trabajar
1. Lee el código de la Fase 1 y muéstrame un plan breve con los pasos. Espera mi aprobación.
2. Orden sugerido: migración → lógica de totales en shared con tests → sesión de cliente
   y apertura de cuenta → creación de pedidos → confirmación y estados → Socket.IO →
   endpoints de operación → frontend del comensal → estación → mesero → caja →
   reporte de hoy → tests restantes → script de hora pico.
3. Al final de cada paso, ejecuta build, migraciones y tests y corrige antes de seguir.
4. Actualiza el seed con algunas cuentas y pedidos de ejemplo en distintos estados.
5. Actualiza el README con el flujo de prueba de punta a punta.

## Criterios de aceptación
- Con el seed cargado y `pnpm dev`, puedo abrir el menú de la mesa 3 en el celular,
  hacer un pedido y verlo aparecer en la pantalla de cocina en menos de 1 segundo
  después de que el mesero lo confirma.
- Dos celulares en la misma mesa ven la misma cuenta y los mismos estados en vivo.
- Si apago el wifi de la tablet de cocina 30 segundos y lo vuelvo a encender,
  aparecen todos los pedidos que llegaron mientras estaba desconectada.
- Caja ve el desglose correcto con servicio e IVA y puede cerrar la cuenta; luego el
  celular del comensal muestra la pantalla de agradecimiento y la mesa queda libre.
- Todos los tests pasan y el script de hora pico termina sin pedidos perdidos ni duplicados.
