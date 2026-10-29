# MEMORY.md — Estado del proyecto

> Leer al inicio de cada sesión. Actualizar después de cada cambio.
> Spec completa: `docs/especificacion-fase1.md`.

## Estado actual

- **Fecha última actualización:** 2026-10-29
- **Fase 1 completa y subida** (commit `a202fd9`).
- **Fase 2 completa y subida** (commit `a0317b7`).
- **Frontend del comensal completo y subido** (commit `5869078`, 2026-10-21).
- **Fase 3 completa** (3.1–3.10, 2026-10-23). Pendiente: revisión del usuario y la spec de la
  próxima fase. Lo que quedó fuera de alcance está en el README.
- **Fase 4 completa** (4.1–4.10, 2026-10-23). Pendiente: prueba completa del usuario.
- **Fase 5 completa** (5.1–5.5, 2026-10-25; commit `3856406`): pedidos en línea + tiempo para pagar el
  SINPE. Pendiente: prueba del usuario.
- **Limpieza** (2026-10-25): revisado código muerto y dependencias; se quitaron `seleccionValida` y `GrupoEditorInput` (shared, sin uso) y la redirección vieja `/dueno` del staff. El resto de dependencias se usan (`@prisma/client` lo pide el cliente generado). `/admin` (SUPERADMIN) sigue como "Próximamente".
- **Backlog de mejoras:** `docs/mejoras-pendientes.md` (ideas del usuario, 2026-10-26; nada programado
  aún, revisado 2026-10-29). Cada bloque se convierte en spec de fase y se aprueba antes de empezar.
- Raíz del monorepo: `C:\Users\gomes\OneDrive\Documentos\sistema-restaurante` (equivale a `menu-qr/` de la spec).

## Plan de la Fase 5 (aprobado 2026-10-23) — spec: docs/especificacion-fase5.md

Pedidos en línea para recoger y a domicilio; pago en efectivo o SINPE verificado a mano. El usuario
autorizó commit + push al cerrar cada sub-fase.

| Paso | Qué                                                                                                    | Estado |
| ---- | ------------------------------------------------------------------------------------------------------ | ------ |
| 5.1  | Modelo y API: cuenta sin mesa (tipo, cliente), config, pedido en línea, seguimiento, acciones, "lugar" | ✅     |
| 5.2  | Cliente: /r/:slug, checkout y seguimiento                                                              | ✅     |
| 5.3  | Personal: pantalla "En línea", avisos, etiquetas, Ajustes, QR del enlace                               | ✅     |
| 5.4  | Reportes por canal, seed, README, tests                                                                | ✅     |
| 5.5  | SINPE: tiempo para pagar; no entra a cocina sin el pago verificado (pedido del usuario 2026-10-25)     | ✅     |

- 5.1: migración `20261023160000_pedidos_en_linea`: Cuenta.mesaId opcional (relación con onDelete
  Restrict; el índice parcial cuenta_unica_abierta sigue igual), Cuenta.tipo (MESA/RECOGER/DOMICILIO),
  numeroPedido, datos del cliente, costoEnvio, pagoElegido, comprobanteSinpe, pagoVerificado, etapa
  (RECIBIDO→ACEPTADO→LISTO→EN_CAMINO→ENTREGADO | RECHAZADO), tiempoEstimadoMin, motivoRechazo,
  tokenSeguimiento; Restaurante.enLinea* + costoEnvio, pedidoMinimo, zonaEntrega, sinpe*, tiempoEstimadoMin.
  `lugarDe()` / `datosLugar` (pedidos/detalle): "Mesa 3" o "Para llevar #12 · Ana"; todos los eventos y
  PedidoEstacion/CuentaDetalle llevan `lugar` (y mesa null en línea). La bandeja del mesero
  (/operacion/pedidos e /operacion/items) excluye las cuentas en línea. Totales en línea: sin servicio y
  - costoEnvio (`recalcularCuenta`). `crearPedido(..., enLinea: { minimo })`: siempre PENDIENTE, mínimo
    dentro de la transacción, sin evento pedido:nuevo. Módulo `enlinea`: POST /public/:slug/pedidos-en-linea
    (limiteEnLinea 10/10 min, idempotente por clientRequestId, máx. 2 pendientes por teléfono, correlativo con
    pg_advisory_xact_lock vía $executeRaw: con $queryRaw falla "UnsupportedNativeDataType" por el void),
    GET /public/seguimiento/:token, y /enlinea (listar, aceptar, rechazar, etapa, pago-verificado,
    entregar) para DUENO/CAJA/MESERO; eventos enlinea:nuevo / enlinea:actualizado a meseros y caja.
    Pendiente para 5.4: excluir los RECHAZADO de los reportes.
- 5.2: menú en línea `apps/menu/src/pantallas/EnLinea.tsx` (/r/:slug, carrito `enlinea:<slug>`, botón
  fijo "Ver pedido"; /r/:slug/pedido: tipo, datos del cliente recordados en el celular, efectivo o
  SINPE con instrucciones, totales sin servicio + envío, pedido mínimo) y `Seguimiento.tsx`
  (/seguimiento/:token, se refresca cada 8 s hasta entregado/rechazado; "en preparación" sale de los
  ítems). Header: mesa y campanita opcionales. TotalsSummary: `envio` y oculta el servicio en 0 %. En
  línea el total se calcula desde que se pide (recalcularCuenta incluye PENDIENTE si tipo ≠ MESA).
  vitest: testTimeout 20 s / hookTimeout 30 s (las corridas intermitentes con ~10 fallos coincidían con
  la máquina ocupada recompilando; con el margen no se repitió). En la BD de desarrollo: pedidos en
  línea activados para la Soda (envío ₡1 000, SINPE de ejemplo) y un "Pedido #1" de prueba.
- 5.3: `apps/staff/src/EnLineaPage.tsx` (/en-linea para DUENO, CAJA y MESERO): columnas Nuevos (tiempo
  estimado + Aceptar / Rechazar con motivo), En curso (progreso de cocina, Pago verificado, Listo para
  entregar, Salió a entregar, Entregado y cobrado con método) y Terminados hoy. Pestañas del encabezado
  por rol (mesero: Mesas / En línea; caja: Caja / En línea) y "Pedidos en línea" en la barra del panel.
  AvisosGlobales avisa `enlinea:nuevo` (3 tonos). Ajustes: `panel/AjustesEnLinea.tsx` (activar,
  tipos, tiempo, mínimo, envío, zona, SINPE, enlace + copiar + QR). GET /restaurante incluye
  `enlaceEnLinea` (con MENU_PUBLIC_URL; sin variable nueva) y GET /restaurante/qr-enlinea.png. Cocina:
  etiqueta más chica si no es mesa. Ajustes: el formulario general va en su propio contenedor para que
  la barra fija "Guardar cambios" no tape "Guardar horario".
- 5.4: reportes: todas las consultas excluyen `etapa = RECHAZADO` (IS DISTINCT FROM, por los null de
  mesa) y hay `porCanal` (MESA/RECOGER/DOMICILIO) en pantalla y CSV. Seed: `enLineaDemo` (activa los
  pedidos en línea si nunca se configuraron) y el historial de 30 días trae ~15 % de pedidos en línea
  (sin mesa, sin servicio, envío a domicilio, ENTREGADO). README: recorrido de la Fase 5, endpoints,
  tests y fuera de alcance.
- 5.5: migración `20261025100000_pago_sinpe` (Restaurante.minutosPagoSinpe default 15; Cuenta.pagarAntesDe,
  se fija al crear el pedido SINPE: cambiar los minutos no toca pedidos ya hechos). API: aceptar no
  confirma el pedido (no va a cocina) si es SINPE sin verificar; `pago-verificado` (updateMany idempotente)
  lo confirma si ya estaba aceptado; LISTO/EN_CAMINO/entregar → 409 PAGO_SIN_VERIFICAR; rechazar se
  permite también ACEPTADO esperando pago (botón "Cancelar" con motivo sugerido). No se cancela solo
  al vencer: decide el restaurante (puede que el cliente sí pagó). Staff: cuenta regresiva en la tarjeta
  (rojo al vencer); cliente: cuenta regresiva en checkout y seguimiento. Tests: 2 nuevos en enlinea.

## Plan de la Fase 4 (aprobado 2026-10-23) — spec: docs/especificacion-fase4.md

El usuario autorizó commit + push al cerrar cada sub-fase (igual que la Fase 3).

| Paso | Qué                                                                                                                                                   | Estado |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 4.1  | Alertas: arreglar sonido de llamada al mesero; cocina >10 min sin empezar (rojo animado); listos sin entregar (verde animado); un solo aviso agrupado | ✅     |
| 4.2  | Animación de carga (cuchillo y tenedor), transiciones generales, ícono de mesa + hover                                                                | ✅     |
| 4.3  | Navegación: barra lateral que se esconde, menú desplegable en el celular                                                                              | ✅     |
| 4.4  | Cantidad de personas al escanear el QR (y cómo se une alguien a una cuenta abierta)                                                                   | ✅     |
| 4.5  | Caja: pagar junto o separado, grupos de ítems con su método de pago y comprobante                                                                     | ✅     |
| 4.6  | Registro de restaurante + dueño                                                                                                                       | ✅     |
| 4.7  | Personalización: ubicación (Google Maps), logo, eslogan, banner; vista bonita para el cliente                                                         | ✅     |
| 4.8  | Tests, seed y README de la Fase 4                                                                                                                     | ✅     |
| 4.9  | Promoción del día en Panel → Menú (sale de Ajustes) + color de fondo del banner                                                                       | ✅     |
| 4.10 | Menús del día (combos fijos o con opciones), por día de la semana o a mano; sección para el cliente                                                   | ✅     |

- 4.1: causas de "no suena la llamada": (a) el audio del navegador queda bloqueado al recargar
  hasta tocar "Activar sonido" → ahora el primer toque/tecla en cualquier parte lo activa
  (`activarConPrimerToque`); (b) si una llamada anterior no se marcó atendida, las siguientes se
  ignoraban → ahora se recuerda al mesero (re-emite `mesa:llamada`, como mucho cada 30 s).
  Centro de avisos `apps/staff/src/avisos.ts` (store fuera de React, campanita `Campana` en
  Encabezado y en el panel, sonido + vibración + Notification API si hay permiso y la pestaña no
  está visible; solo en https/localhost). `AvisosGlobales` abre un socket por sesión y avisa según
  rol (llamada, pedido nuevo, cuenta pedida; cocina: pedido confirmado); las pantallas ya no suenan
  por su cuenta. Cocina: pedido con todos los ítems PENDIENTE y >10 min desde confirmado →
  `alerta-roja`. Mesero: ítem LISTO con updatedAt >5 min → `alerta-verde` en la bandeja y la mesa.
  Aviso agrupado (`avisoAgrupado` en shared, con test): un aviso por tanda, solo con ids nuevos.
  Ojo dev: al cambiar `packages/shared` el `tsx watch` de la API se cayó una vez; reiniciar `pnpm dev`.
- 4.2: `packages/ui/src/cargando.tsx`: `Cargando` (tenedor y cuchillo SVG que se cruzan, CSS en
  tokens.css) e `IconoMesa`. Se usa al abrir la mesa en el menú (reemplaza al esqueleto, que se
  borró), al restaurar la sesión del staff y como overlay "Entrando…" en el login (el login dura al
  menos 0,7 s si sale bien). Transiciones: `.anim-entrar` en cada pantalla (key = ruta) y en tarjetas
  nuevas (cocina, bandeja, caja, mesas); transiciones por defecto en botones/enlaces/campos y
  `scale: .97` al presionar (tokens.css); hover que levanta las tarjetas de mesa. Todo respeta la
  regla global de "reducir movimiento".
- 4.3: PanelLayout: en md+ barra fija de 72 px solo con íconos (`group`); con hover o foco de
  teclado se ensancha a 240 px encima del contenido (no lo empuja) y los textos aparecen con
  opacidad. En el celular se quitó la barra inferior: encabezado con botón de menú → cajón lateral
  (`anim-cajon`, se cierra con Escape, tocando afuera o al elegir una opción). Campanita y "Activar
  sonido" en el encabezado del celular y arriba a la derecha en escritorio.
- 4.4: migración `20261023100000_personas_mesa` (Cuenta.ingresoBloqueado, rechazosIngreso; modelo
  SolicitudIngreso con claveHash, expiraEn 3 min, entregada). `numeroComensales` = cupo (null = sin
  definir, no limita). Al escanear: si las sesiones activas de la cuenta ≥ cupo → 409 MESA_LLENA
  {numero, personas, bloqueada}. Rutas: POST /public/cuenta/personas, POST /public/mesa/:token/ingreso
  (crea solicitud; emite `ingreso:solicitado` a la cuenta), POST /public/mesa/:token/ingreso/:id
  {clave} (el que espera consulta cada 2 s; ACEPTADA entrega la sesión una sola vez), POST
  /public/cuenta/ingresos/:id {aceptar} (cupo +1 o rechazo +1), POST /public/cuenta/desbloquear-ingreso.
  Bloqueo: 3 rechazos o 5 solicitudes en 10 min → 423 MESA_BLOQUEADA. Menú: MesaLlenaScreen,
  PersonasModal (bloquea hasta responder; "Cambiar" en Mi cuenta), SolicitudesIngreso (modal para los
  de la mesa). Mesero ve las personas en la tarjeta (MesaOperacion.cuenta.personas). Las cuentas
  abiertas antes de esto también piden la cantidad.
- 4.5: migración `20261023110000_cuentas_separadas` (PagoCuenta con método y totales;
  PedidoItem.pagoId). POST /operacion/cuentas/:id/pagos {nombre?, metodoPago, items:[{itemId,
  cantidad}]}: si se cobra parte de un ítem con cantidad > 1 se divide en dos filas (resto y cobrado,
  copiando modificadores). Al cobrar lo último la cuenta se cierra (`cerrarEnTx`, común con "todo
  junto") con totales = suma de los grupos y método MIXTO si hubo varios. "Todo junto" con pagos
  separados → 409 PAGO_SEPARADO. DELETE /operacion/cuentas/:id/pagos/:pagoId deshace (cuenta abierta;
  las filas divididas no se vuelven a juntar). Caja: selector "¿Cómo pagan?", grupos cobrados con
  "Imprimir comprobante" (ticket 80 mm por grupo, "NO ES FACTURA ELECTRÓNICA") y "Deshacer".
- 4.6: migración `20261023120000_registro` (Restaurante.telefono, direccion). POST /auth/registro
  (limiteRegistro: 5 por IP/hora) con `registroSchema`: crea restaurante activo + dueño + estaciones
  Cocina/Bar + horario todos los días 7:00–21:00 y hace login (cookie de refresh). Slug desde el nombre
  sin tildes (`p{Diacritic}`), con -2, -3 si existe. Correo repetido → 409 CORREO_EN_USO. Sin
  confirmación de correo (decisión del usuario: recomendación aceptada). Staff: /registro en 2 pasos
  ("Su local" / "Sus datos"), enlace "Cree su cuenta" en el login; `erroresDe(e, prefijo)`.
- 4.7: migración `20261023130000_personalizacion` (Restaurante.eslogan, bannerUrl, ubicacionUrl).
  Upload destino `banner` (1600×600 cover, webp; el reemplazado se borra). `shared/mapa.ts`
  (subruta `@menu-qr/shared/mapa` para no meter zod en el menú): `esEnlaceDeMaps` (https + dominio de
  Google o goo.gl, por URL, no regex), `mapaIncrustado` (iframe `google.com/maps?q=…&output=embed`, sin
  clave) y `comoLlegar`. UI: Header con portada (banner a todo lo ancho en celular, logo que se monta
  encima, eslogan) e `InfoLocal` ("Encuéntrenos": mapa, dirección, Cómo llegar, teléfono) al final del
  menú. Panel: /panel/personalizar (nombre, eslogan, logo, banner, color, teléfono, dirección, enlace
  Maps, vista previa con los mismos componentes); logo y color salieron de Ajustes. Tras registrarse,
  el dueño cae en /panel/personalizar?bienvenida.
- 4.8: seed: `personalizacionDemo` (banner generado, eslogan, teléfono y dirección si faltan).
  README: recorrido de la Fase 4, endpoints nuevos y qué cubren los tests. Una corrida de `pnpm test`
  dio 10 fallos en la API que no se repitieron en tres corridas seguidas (posible interferencia con
  `tsx watch` reiniciando mientras corrían): vigilar.
- 4.9: migración `20261023140000_color_promo` (Restaurante.colorPromo, con el mismo control de
  contraste que colorAcento). `MenuPublico.promocion.color`; `PromoBanner` acepta `color`. La
  promoción salió de Ajustes: `panel/menu/PromocionDia.tsx` arriba de Panel → Menú (resumen, editar,
  quitar, vista previa con el banner real).
- 4.10: migración `20261023150000_menu_del_dia` (Plato.menuDelDia, diasSemana Int[], fechaMenu DATE).
  Un menú del día es un Plato más (así sirven pedidos, cocina, cuentas separadas y reportes sin
  cambios): fijo = lo que incluye va en la descripción; con opciones = grupos de modificadores.
  `menuDelDiaHoy` / `fechaLocal` en shared/horario (hora local, con test). Menú público: salen de su
  categoría y van en `MenuPublico.menuDelDia` solo si tocan hoy (con el icono de su categoría); pedirlo
  otro día → 409 PLATO_NO_DISPONIBLE motivo `no_es_hoy`. Panel → Menú: `MenusDelDia.tsx` (lista con
  "Hoy" y "Agregar menú del día" → PlatoForm con ?menuDelDia=1: días Lun–Dom, fecha o "Solo hoy").
  Cliente y mesero (TomarPedido): `SeccionMenuDelDia` (ui) arriba de las categorías. En la BD de
  desarrollo quedó un "Almuerzo del día" de prueba (Lun–Vie, ₡4 500).

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
| 3.8  | Reportes agregados en SQL + vistas de platos + recharts + CSV                                          | ✅     |
| 3.9  | Rediseño de estación, mesero y caja con la identidad visual                                            | ✅     |
| 3.10 | Tests obligatorios, seed (fotos generadas, horarios, promo, dispositivo, 30 días), README              | ✅     |

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
  sharp prebuilt NO decodifica HEIC/HEVC → 415 "Súbala en JPG o PNG". Resuelto (revisado 2026-10-29): al duplicar un
  plato NO se copian las URLs de foto (borrar una borraría la del otro).
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
- 3.8: migración `20261022170000_reportes` (VistaPlato por plato+día local; índice Cuenta(restauranteId,estado,cerradaEn)).
  GET /reportes?desde&hasta (días locales, zonaHoraria del restaurante, todo en SQL con $queryRaw; ~130 ms).
  POST /public/cuenta/vistas/:id (el menú registra 1 vista por plato por visita). MINUTOS_DEMORA=20 en shared.
  Staff: panel/reportes (recharts lazy, tablas con barra, CSV armado en el navegador con los mismos datos).
- 3.10: `prisma/demo-extra.ts` (lo llama el seed y agrega solo lo que falte, sin borrar): fotos simples
  con sharp (degradado por categoría + nombre) guardadas con el storage driver; "Tablet de la cocina"
  vinculada; 30 días de cuentas cerradas con PRNG de semilla fija (horas pico 11–14 y 17–19, ~10 %
  demorados, ~3 % cancelados con motivo, vistas de platos) insertadas con createMany (~17 s). Test: el
  reporte de 30 días sobre ese historial cuadra con la suma de cuentas cerradas y tarda < 1 s. Encabezado
  del staff con ancho mínimo de título (en 360 px los botones bajan de línea). README: recorrido Fase 3.
- 3.9: tokens del tema (claro/oscuro) en ui.tsx, EstacionPage, MeseroPage, TomarPedido y CajaPage. Estación:
  3 columnas (Nuevos / En preparación / Listos) según el ítem menos avanzado del pedido; reloj amarillo 10 min,
  rojo MINUTOS_DEMORA; "Deshacer" 5 s → POST /operacion/items/:id/deshacer {estado} (vuelve al anterior y borra
  la marca de tiempo; el servidor tolera 15 s). Mesero: cuadrícula con insignias (por confirmar, llama, cuenta,
  listos) y una sola bandeja "Pendientes" ordenada por antigüedad; detalle de mesa con Modal de @menu-qr/ui.
  TomarPedido usa SearchBar/CategoryGrid/DishCard/DishSheet del menú del comensal. Caja: mismo flujo, estilo nuevo.
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
