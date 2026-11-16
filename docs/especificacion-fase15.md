# Fase 15 — Factura electrónica (borrador, sin aprobar)

Pedidos del usuario (2026-11-13):

- "La factura se emite en cada compra, como si fuese un sistema de punto de venta."
- "Cuando no hay internet se va acumulando todo y luego se manda a Hacienda, como una cola."
- "Sí estoy registrado como proveedor de sistemas" (régimen general). "Ya te paso los datos."
- 10 % de servicio: "dame la sugerencia más útil".

Estado: **en curso** (2026-11-15: "vamos con facturación electrónica"; librerías aprobadas: "sí apruebo node-forge y xadesjs"; el usuario rellenó los datos del emisor).

Estado anterior: borrador. Falta que el usuario configure los datos del ambiente de pruebas y que se
verifique cada punto marcado (verificar) contra la documentación vigente de Hacienda (v4.4,
TRIBU-CR) y con su contador antes de programar.

## Decisiones

1. **Un comprobante por cada cobro** (cuenta completa o grupo de una cuenta separada, y pedidos en
   línea al entregarse/cobrarse).
   - **Tiquete electrónico** por defecto (consumidor final).
   - **Factura electrónica** si el cliente da sus datos (tipo y número de identificación, nombre,
     correo): campo opcional "¿Factura a nombre de alguien?" en Caja.
   - Anular o corregir: **nota de crédito** sobre el comprobante original.
2. **10 % de servicio** (aprobado por el usuario, 2026-11-13; confirmado por la información que
   trajo): va en el nodo **OtrosCargos** con el código **06 "Impuesto de servicio 10 %"**, calculado
   sobre el subtotal sin IVA, **sin IVA encima**, sin CABYS y fuera de las líneas de platos.
   Coincide con `calcularTotales`. Solo aplica con servicio en mesa (Ley 9116): pedidos en línea,
   para llevar y de mostrador no lo llevan (ya es así).
3. **Cola de envío:** el comprobante se arma (clave, consecutivo, XML firmado) al momento del cobro
   y se guarda con estado PENDIENTE; un proceso de la API lo envía a Hacienda y reintenta con
   espera creciente hasta tener respuesta (ACEPTADO / RECHAZADO). Si Hacienda o la conexión fallan,
   se acumulan y salen solos al volver. Plazo máximo para enviar documentos atrasados: verificar.
4. **Líneas:** cada plato con su CABYS (el propio o el general del restaurante, Fase 13) y su tarifa
   de IVA. Sin CABYS general configurado no se puede facturar (aviso en Ajustes).
5. **Datos por restaurante** (cada uno factura a su nombre): identificación, nombre, actividad
   económica, ubicación, correo, credenciales de la API de Hacienda, llave criptográfica (.p12) y
   PIN. La llave y el PIN se guardan **cifrados**.
6. **KitchaGo como proveedor de sistemas:** la cédula del proveedor va en cada comprobante
   (variable de entorno, no en el repo).

## Datos que configura el usuario (en `.env` local, nunca en el chat ni en el repo)

El usuario los puso con los nombres de su sistema anterior (2026-11-15); se adoptan esos nombres:
`HACIENDA_ENV` (pruebas), `HACIENDA_USER` / `HACIENDA_PASSWORD` (usuario de la API del ambiente de
pruebas, `cpf-…@stag.comprobanteselectronicos.go.cr`), `HACIENDA_P12_PATH` (ruta a la llave, fuera
del repo) y `HACIENDA_P12_PIN`, `HACIENDA_TEST_UBICACION` (provincia-cantón-distrito),
`HACIENDA_ACTIVITY` (código CIIU 4 del emisor, formato `NNNN.N`) y `EINVOICE_SECRET` (cifrar las
credenciales de cada restaurante en la base). Faltaban y se agregaron vacías:
`HACIENDA_EMISOR_NOMBRE`, `HACIENDA_EMISOR_CORREO`, `HACIENDA_EMISOR_OTRAS_SENAS`. La
identificación del emisor y del proveedor de sistemas sale del usuario de la API (cédula física).

**Actividad económica:** desde el 6 de octubre de 2025 (TRIBU-CR) los códigos son CIIU 4 con formato
`NNNN.N` (la tabla oficial de Hacienda convierte los códigos viejos de ATV de 6 dígitos a este
formato). `6201.0` es la clase CIIU 4 "Actividades de programación informática": concuerda con
KitchaGo como proveedor de software y sirve para el emisor de prueba. En producción cada restaurante
usa **su propio** código (los restaurantes están en la clase CIIU 4 5610, "actividades de
restaurantes y de servicio móvil de comidas"; la subclase exacta la toma cada uno de su registro en
TRIBU-CR), así que el código se configura por restaurante, no fijo.

## Temas relacionados que trajo el usuario (a decidir, no incluidos)

- **Precio en el menú (MEIC, Decreto 37899-MEIC):** según la información traída, la carta debe
  mostrar el precio final con IVA **y** el 10 % ya incluidos. Hoy el menú muestra el precio con IVA
  y el servicio se suma al cobrar. Verificar con el contador y decidir si se agrega una opción
  "mostrar precios con servicio incluido".
- **El 10 % pertenece a los saloneros** (sin rebajos; se liquida en una semana si fue efectivo y en
  un mes si fue con tarjeta): se podría agregar un reporte "servicio a repartir" por periodo.

## Pendiente de verificar

Plazo de documentos en contingencia, campos nuevos de
v4.4 (proveedor de sistemas, actividad económica del receptor), y cómo se obtienen hoy las
credenciales y la llave en TRIBU-CR.

## Fuera de alcance (de esta fase)

Factura de exportación, compras (factura electrónica de compra), exoneraciones, recepción de
comprobantes de proveedores.

## Plan

1. **15.1** Núcleo contra el ambiente de pruebas: clave y consecutivo, XML v4.4 del tiquete, firma
   XAdES-EPES con la llave .p12, token y envío a Hacienda, consulta del estado. Prueba real con un
   script. ✅ Hecho: tiquete aceptado por Hacienda (ambiente de pruebas), 2026-11-15.
2. **15.2** Modelo `Comprobante` (cola) y configuración de Hacienda por restaurante (cifrada); emitir
   al cobrar en caja y en línea; proceso de envío con reintentos.
   Decisiones de la 15.2 (2026-11-15, "sí súbelo y sigue con la 15.2"):
   - `ConfigHacienda` por restaurante (1 a 1): datos del emisor, actividad, credenciales de la API,
     llave .p12 y PIN **cifrados con AES-256-GCM** (llave derivada de `EINVOICE_SECRET`) y los
     siguientes números de consecutivo por tipo. Solo emite si está activa.
   - Se emite un comprobante por cobro: cuenta completa (cerrar), cada grupo de una cuenta
     separada y cada pedido en línea al entregarse. Se arma y firma justo después del cobro (el
     cobro nunca falla por Hacienda) y queda en la cola `Comprobante` (PENDIENTE → ENVIADO →
     ACEPTADO / RECHAZADO, o ERROR si no se pudo armar, p. ej. sin CABYS).
   - Proceso de envío cada 30 s: envía los pendientes y consulta los enviados; si Hacienda o la red
     fallan, reintenta con espera creciente (hasta 1 h entre intentos).
   - Costo de envío de domicilio: en OtrosCargos código 99 "Costo de envío" (verificar con el
     contador si debe ir como línea de servicio con IVA).
   - Proveedor de sistemas: `HACIENDA_PROVEEDOR_ID` (si falta, la cédula del usuario de pruebas).
   - Script `hacienda:configurar <slug>` carga la configuración de prueba del .env en un restaurante
     (la pantalla de Ajustes llega en la 15.3).
     ✅ Hecho (2026-11-15): cobro en caja y entrega a domicilio aceptados por Hacienda en pruebas.
3. **15.3** Caja: factura con datos del cliente y estado del comprobante; Ajustes: datos de Hacienda.
4. **15.4** Nota de crédito para anular.
