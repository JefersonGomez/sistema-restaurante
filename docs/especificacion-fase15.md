# Fase 15 — Factura electrónica (borrador, sin aprobar)

Pedidos del usuario (2026-11-13):

- "La factura se emite en cada compra, como si fuese un sistema de punto de venta."
- "Cuando no hay internet se va acumulando todo y luego se manda a Hacienda, como una cola."
- "Sí estoy registrado como proveedor de sistemas" (régimen general). "Ya te paso los datos."
- 10 % de servicio: "dame la sugerencia más útil".

Estado: **borrador**. Falta que el usuario configure los datos del ambiente de pruebas y que se
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

Variables ya creadas (vacías) en `.env` y `.env.example` (pedido del usuario: "pon en el .env las
variables para rellenarlas"): `HACIENDA_AMBIENTE`, `PROVEEDOR_TIPO_ID`, `PROVEEDOR_NUMERO_ID`,
`HACIENDA_USUARIO`, `HACIENDA_CLAVE`, `HACIENDA_LLAVE_P12` (ruta; la llave va en `secretos/`, que
git ignora junto con `*.p12`), `HACIENDA_LLAVE_PIN` y los datos del emisor de prueba
(`EMISOR_*`). Son para el ambiente de pruebas; en producción cada restaurante tendrá los suyos
guardados cifrados en la base de datos.

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
