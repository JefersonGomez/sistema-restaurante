import { z } from 'zod';
import { esEnlaceDeMaps } from './mapa';
import { acentoLegible } from './color';
import { HORA_REGEX, zonaHorariaValida } from './horario';

// Mensajes de validación en español (API y formularios del panel).
z.config(z.locales.es());

export const rolSchema = z.enum(['SUPERADMIN', 'DUENO', 'MESERO', 'COCINA', 'CAJA']);
export type Rol = z.infer<typeof rolSchema>;

export const monedaSchema = z.enum(['CRC', 'USD']);
export type Moneda = z.infer<typeof monedaSchema>;

export const idiomaSchema = z.enum(['es', 'en']);
export type Idioma = z.infer<typeof idiomaSchema>;

// --- Piezas comunes ---
// Sin .default() en los esquemas: con .partial() se aplicarían también al actualizar.
// Los valores por defecto los pone la base de datos.

const texto = (max = 120) =>
  z.string().trim().min(1, 'Este campo es obligatorio').max(max, `Máximo ${max} caracteres`);
const textoOpcional = (max = 500) => z.string().trim().max(max).nullable().optional();
const urlOpcional = z.url().max(500).nullable().optional();
const centimos = z.number().int().min(0).max(1_000_000_000);
const porcentaje = z.number().int().min(0).max(100);
const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().min(8).max(200);
export const telefonoSchema = z
  .string()
  .trim()
  .regex(/^[0-9 +()-]{8,20}$/, 'Teléfono de 8 dígitos, ej. 8888 8888');

export const idParamSchema = z.object({ id: z.uuid() });

// --- Auth ---

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const cambiarPasswordSchema = z.object({
  actual: z.string().min(1).max(200),
  nueva: password,
});

// --- Dispositivos (tablets de cocina/bar) ---

const pin = z.string().regex(/^\d{4}$/, 'El PIN son 4 números');
export const codigoDispositivoSchema = z.object({ nombre: texto(60), estacionId: z.uuid() });
export const vincularDispositivoSchema = z.object({
  codigo: z.string().regex(/^\d{6}$/, 'El código son 6 números'),
});
export const entrarConPinSchema = z.object({ usuarioId: z.uuid(), pin });
export const pinUsuarioSchema = z.object({ pin: pin.nullable() }); // null = quitar el PIN
export type CodigoDispositivoInput = z.infer<typeof codigoDispositivoSchema>;

// --- Restaurante ---

export const modoConfirmacionSchema = z.enum(['SIEMPRE', 'PRIMER_PEDIDO', 'NUNCA']);
export type ModoConfirmacion = z.infer<typeof modoConfirmacionSchema>;

export const restauranteConfigSchema = z
  .object({
    nombre: texto(),
    logoUrl: urlOpcional,
    // Acento del menú del comensal (null = morado del diseño). Lleva texto blanco encima.
    colorAcento: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color hex, ej. #5b2db5')
      .refine(acentoLegible, 'Ese color no contrasta con el texto blanco; elija uno más oscuro')
      .nullable(),
    moneda: monedaSchema,
    idiomas: z.array(idiomaSchema).min(1).max(2),
    porcentajeIva: porcentaje,
    porcentajeServicio: porcentaje,
    preciosIncluyenImpuestos: z.boolean(),
    modoConfirmacion: modoConfirmacionSchema,
    zonaHoraria: z
      .string()
      .refine(zonaHorariaValida, 'Zona horaria inválida (ej. America/Costa_Rica)'),
    cerradoManual: z.boolean(), // "Cerrar temporalmente"
    telefono: telefonoSchema.nullable(),
    direccion: z.string().trim().max(200).nullable(),
    // Personalización (lo ve el cliente en el menú).
    eslogan: z.string().trim().max(120).nullable(),
    bannerUrl: urlOpcional,
    ubicacionUrl: z
      .url('Pegue el enlace de Google Maps')
      .refine(
        esEnlaceDeMaps,
        'Tiene que ser un enlace de Google Maps (maps.app.goo.gl o google.com/maps)',
      )
      .nullable(),
    // Promoción del banner: con precioPromo, ese es el precio que se cobra por el plato.
    platoDestacadoId: z.uuid().nullable(),
    textoPromoEs: z.string().trim().max(80).nullable(),
    textoPromoEn: z.string().trim().max(80).nullable(),
    precioPromo: centimos.nullable(),
    // Fondo del banner de la promoción (texto blanco encima: necesita contraste).
    colorPromo: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color hex, ej. #17131f')
      .refine(acentoLegible, 'Ese color no contrasta con el texto blanco; elija uno más oscuro')
      .nullable(),
    // Pedidos en línea (Fase 5).
    enLineaActivo: z.boolean(),
    enLineaRecoger: z.boolean(),
    enLineaDomicilio: z.boolean(),
    costoEnvio: centimos,
    pedidoMinimo: centimos,
    zonaEntrega: z.string().trim().max(200).nullable(),
    sinpeNumero: telefonoSchema.nullable(),
    sinpeNombre: z.string().trim().max(80).nullable(),
    tiempoEstimadoMin: z.number().int().min(5).max(240),
  })
  .partial();
export type RestauranteConfigInput = z.infer<typeof restauranteConfigSchema>;

export const crearRestauranteSchema = z.object({
  restaurante: z.object({
    nombre: texto(),
    slug: z
      .string()
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones'),
    moneda: monedaSchema.optional(),
    plan: texto(40).optional(),
  }),
  dueno: z.object({ nombre: texto(), email, password }),
});
export type CrearRestauranteInput = z.infer<typeof crearRestauranteSchema>;

// Registro público: el dueño crea su restaurante (queda activo y con la sesión iniciada).
export const registroSchema = z.object({
  restaurante: z.object({
    nombre: texto(80),
    telefono: telefonoSchema,
    direccion: z.string().trim().max(200).optional(),
  }),
  dueno: z.object({ nombre: texto(), email, password }),
});
export type RegistroInput = z.infer<typeof registroSchema>;

export const adminRestaurantePatchSchema = z
  .object({ activo: z.boolean(), plan: texto(40) })
  .partial();
export type AdminRestaurantePatchInput = z.infer<typeof adminRestaurantePatchSchema>;

// --- Usuarios (personal del restaurante) ---

export const rolPersonalSchema = z.enum(['DUENO', 'MESERO', 'COCINA', 'CAJA']);

export const crearUsuarioSchema = z.object({
  nombre: texto(),
  email,
  password,
  rol: rolPersonalSchema,
  estacionId: z.uuid().nullable().optional(), // COCINA: su estación; null = todas
});
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

export const actualizarUsuarioSchema = crearUsuarioSchema.extend({ activo: z.boolean() }).partial();
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;

// --- Menú ---

export const estacionSchema = z.object({ nombre: texto(60) });
export type EstacionInput = z.infer<typeof estacionSchema>;

export const categoriaSchema = z.object({
  nombreEs: texto(),
  nombreEn: texto(),
  orden: z.number().int().min(0).optional(),
  activa: z.boolean().optional(),
  icono: z.string().trim().max(16).nullable().optional(), // emoji
});
export const actualizarCategoriaSchema = categoriaSchema.partial();
export type CategoriaInput = z.infer<typeof categoriaSchema>;
export type ActualizarCategoriaInput = z.infer<typeof actualizarCategoriaSchema>;

export const ordenSchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'IDs repetidos'),
});
export type OrdenInput = z.infer<typeof ordenSchema>;

export const platoSchema = z.object({
  categoriaId: z.uuid(),
  estacionId: z.uuid(),
  nombreEs: texto(),
  nombreEn: texto(),
  descripcionEs: textoOpcional(),
  descripcionEn: textoOpcional(),
  precio: centimos,
  fotoUrl: urlOpcional, // 960 px (POST /uploads/imagen → url960)
  fotoMiniUrl: urlOpcional, // 320 px (url320)
  agotado: z.boolean().optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().min(0).optional(),
  alergenos: z.array(texto(40)).max(20).optional(),
  // Menú del día: días de la semana (0 = domingo) y/o una fecha puntual "AAAA-MM-DD".
  menuDelDia: z.boolean().optional(),
  diasSemana: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  fechaMenu: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD')
    .nullable()
    .optional(),
});
export const actualizarPlatoSchema = platoSchema.partial();
export type PlatoInput = z.infer<typeof platoSchema>;
export type ActualizarPlatoInput = z.infer<typeof actualizarPlatoSchema>;

export const agotadoSchema = z.object({ agotado: z.boolean() });

export const platoParamSchema = z.object({ platoId: z.uuid() });
export const grupoParamSchema = platoParamSchema.extend({ grupoId: z.uuid() });
export const modificadorParamSchema = grupoParamSchema.extend({ modificadorId: z.uuid() });

export const grupoSchema = z.object({
  nombreEs: texto(),
  nombreEn: texto(),
  obligatorio: z.boolean().optional(),
  minimo: z.number().int().min(0).max(50).optional(),
  maximo: z.number().int().min(1).max(50).optional(),
});
export const actualizarGrupoSchema = grupoSchema.partial();
export type GrupoInput = z.infer<typeof grupoSchema>;
export type ActualizarGrupoInput = z.infer<typeof actualizarGrupoSchema>;

export const modificadorSchema = z.object({
  nombreEs: texto(),
  nombreEn: texto(),
  precioExtra: centimos.optional(),
});
export const actualizarModificadorSchema = modificadorSchema.partial();
export type ModificadorInput = z.infer<typeof modificadorSchema>;
export type ActualizarModificadorInput = z.infer<typeof actualizarModificadorSchema>;

// Turnos de atención (PUT /restaurante/horarios reemplaza todos).
export const turnoSchema = z.object({
  diaSemana: z.number().int().min(0).max(6), // 0 = domingo
  abre: z.string().regex(HORA_REGEX, 'Hora HH:mm'),
  cierra: z.string().regex(HORA_REGEX, 'Hora HH:mm'),
});
export const horariosSchema = z.object({ turnos: z.array(turnoSchema).max(28) });
export type HorariosInput = z.infer<typeof horariosSchema>;

// Editor de modificadores del panel: guarda todos los grupos de un plato de una vez.
// Con id se actualiza, sin id se crea; los que no vienen se borran.
const modificadorEditorSchema = z.object({
  id: z.uuid().optional(),
  nombreEs: texto(),
  nombreEn: texto(),
  precioExtra: centimos,
});
export const grupoEditorSchema = z
  .object({
    id: z.uuid().optional(),
    nombreEs: texto(),
    nombreEn: texto(),
    obligatorio: z.boolean(),
    minimo: z.number().int().min(0).max(50),
    maximo: z.number().int().min(1).max(50),
    modificadores: z.array(modificadorEditorSchema).min(1, 'Agregue al menos una opción').max(30),
  })
  .superRefine((g, ctx) => {
    if (g.minimo > g.maximo)
      ctx.addIssue({
        code: 'custom',
        path: ['minimo'],
        message: 'El mínimo no puede ser mayor que el máximo',
      });
    if (g.obligatorio && g.minimo < 1)
      ctx.addIssue({
        code: 'custom',
        path: ['minimo'],
        message: 'Un grupo obligatorio necesita mínimo 1',
      });
    if (g.minimo > g.modificadores.length)
      ctx.addIssue({
        code: 'custom',
        path: ['minimo'],
        message: 'Hay menos opciones que el mínimo',
      });
  });
export const guardarGruposSchema = z.object({ grupos: z.array(grupoEditorSchema).max(15) });
export type GrupoEditorInput = z.infer<typeof grupoEditorSchema>;
export type GuardarGruposInput = z.infer<typeof guardarGruposSchema>;

// --- Mesas ---

export const mesaSchema = z.object({
  numero: z.number().int().min(1).max(9999),
  nombre: textoOpcional(60),
  activa: z.boolean().optional(),
});
export const actualizarMesaSchema = mesaSchema.partial();
export type MesaInput = z.infer<typeof mesaSchema>;
export type ActualizarMesaInput = z.infer<typeof actualizarMesaSchema>;

export const qrQuerySchema = z.object({ formato: z.enum(['png', 'svg']).default('png') });

// --- Público ---

export const slugParamSchema = z.object({ slug: z.string().min(1).max(60) });
export const tokenParamSchema = z.object({ token: z.string().min(20).max(100) });

// Respuestas del API público (las usa apps/menu).
export type ModificadorPublico = {
  id: string;
  nombreEs: string;
  nombreEn: string;
  precioExtra: number;
};
export type GrupoPublico = {
  id: string;
  nombreEs: string;
  nombreEn: string;
  obligatorio: boolean;
  minimo: number;
  maximo: number;
  modificadores: ModificadorPublico[];
};
export type PlatoPublico = {
  id: string;
  nombreEs: string;
  nombreEn: string;
  descripcionEs: string | null;
  descripcionEn: string | null;
  precio: number;
  fotoUrl: string | null;
  fotoMiniUrl: string | null;
  agotado: boolean;
  precioAntes: number | null; // precio normal si el plato está en promoción (precio = el de promo)
  alergenos: string[];
  grupos: GrupoPublico[];
};
export type MenuPublico = {
  restaurante: {
    nombre: string;
    slug: string;
    logoUrl: string | null;
    colorAcento: string | null;
    eslogan: string | null;
    bannerUrl: string | null;
    telefono: string | null;
    direccion: string | null;
    ubicacionUrl: string | null;
    moneda: Moneda;
    idiomas: Idioma[];
    porcentajeIva: number;
    porcentajeServicio: number;
    preciosIncluyenImpuestos: boolean;
    zonaHoraria: string;
    abierto: boolean; // calculado por el servidor (horario + cierre manual)
    cerradoManual: boolean;
    horarioHoy: { abre: string; cierra: string }[];
    enLinea: {
      activo: boolean;
      recoger: boolean;
      domicilio: boolean;
      costoEnvio: number;
      pedidoMinimo: number;
      zonaEntrega: string | null;
      sinpeNumero: string | null;
      sinpeNombre: string | null;
      tiempoEstimadoMin: number;
    };
  };
  promocion: {
    platoId: string;
    textoEs: string | null;
    textoEn: string | null;
    precio: number;
    precioAntes: number | null;
    color: string | null; // fondo del banner (null = el del diseño)
  } | null;
  // Menús del día (combos) programados para hoy; el icono es el de su categoría.
  menuDelDia: (PlatoPublico & { icono: string | null })[];
  categorias: {
    id: string;
    nombreEs: string;
    nombreEn: string;
    icono: string | null;
    platos: PlatoPublico[];
  }[];
};
export type MesaPublica = {
  slug: string;
  restaurante: string;
  numero: number;
  nombre: string | null;
  cuentaId: string;
  token: string; // sesión del comensal (Authorization: Bearer)
  personas: number | null; // cupo de la cuenta; null = todavía nadie dijo cuántos son
};
// 409 MESA_LLENA al escanear: la cuenta ya tiene todo su cupo (details).
export type MesaLlena = { numero: number; personas: number; bloqueada: boolean };

// --- Operación (Fase 2) ---

export const estadoPedidoSchema = z.enum(['PENDIENTE', 'CONFIRMADO', 'CANCELADO']);
export type EstadoPedido = z.infer<typeof estadoPedidoSchema>;
export const estadoItemSchema = z.enum(['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']);
export type EstadoItem = z.infer<typeof estadoItemSchema>;
export const estadoCuentaSchema = z.enum(['ABIERTA', 'PIDIO_CUENTA', 'CERRADA']);
export type EstadoCuenta = z.infer<typeof estadoCuentaSchema>;
export const metodoPagoSchema = z.enum(['EFECTIVO', 'TARJETA', 'SINPE', 'MIXTO']);
export type MetodoPago = z.infer<typeof metodoPagoSchema>;

export const LIMITES_PEDIDO = { itemsMax: 30, cantidadMax: 20, notasMax: 200 } as const;

export const crearPedidoSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(100),
  nota: z.string().trim().max(LIMITES_PEDIDO.notasMax).optional(),
  items: z
    .array(
      z.object({
        platoId: z.uuid(),
        cantidad: z.number().int().min(1).max(LIMITES_PEDIDO.cantidadMax),
        notas: z.string().trim().max(LIMITES_PEDIDO.notasMax).optional(),
        modificadores: z
          .array(z.uuid())
          .max(50)
          .refine((ids) => new Set(ids).size === ids.length, 'Modificadores repetidos')
          .default([]),
      }),
    )
    .min(1)
    .max(LIMITES_PEDIDO.itemsMax),
});
export type CrearPedidoInput = z.infer<typeof crearPedidoSchema>;

export const motivoSchema = z.object({ motivo: z.string().trim().min(1).max(200) });

// --- Pedidos en línea (Fase 5) ---
export const pedidoEnLineaSchema = crearPedidoSchema
  .extend({
    tipo: z.enum(['RECOGER', 'DOMICILIO']),
    cliente: z.object({
      nombre: texto(80),
      telefono: telefonoSchema,
      direccion: z.string().trim().max(200).optional(),
      referencia: z.string().trim().max(200).optional(),
    }),
    pago: z.object({
      metodo: z.enum(['EFECTIVO', 'SINPE']),
      comprobante: z.string().trim().max(40).optional(),
    }),
  })
  .refine((p) => p.tipo === 'RECOGER' || (p.cliente.direccion?.length ?? 0) >= 5, {
    message: 'Escriba la dirección de entrega',
    path: ['cliente', 'direccion'],
  });
export type PedidoEnLineaInput = z.infer<typeof pedidoEnLineaSchema>;
export const aceptarEnLineaSchema = z.object({
  tiempoEstimadoMin: z.number().int().min(5).max(240),
});
export const etapaEnLineaCambioSchema = z.object({ etapa: z.enum(['LISTO', 'EN_CAMINO']) });
export const entregarEnLineaSchema = z.object({
  metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'SINPE']),
});
export const cambiarEstadoItemSchema = z.object({
  estado: z.enum(['EN_PREPARACION', 'LISTO', 'ENTREGADO']),
});
export const cerrarCuentaSchema = z.object({ metodoPago: metodoPagoSchema });
// Cuenta separada: cobra un grupo de ítems (de un ítem con cantidad > 1 se puede cobrar una parte).
export const cobrarParteSchema = z.object({
  nombre: z.string().trim().max(40).optional(),
  metodoPago: metodoPagoSchema,
  items: z
    .array(z.object({ itemId: z.uuid(), cantidad: z.number().int().min(1).max(999) }))
    .min(1, 'Elija al menos un plato')
    .max(200),
});
export type CobrarParteInput = z.infer<typeof cobrarParteSchema>;
export const pagoParamSchema = z.object({ id: z.uuid(), pagoId: z.uuid() });
export const llamarSchema = z.object({ tipo: z.literal('MESERO') });
// Cuántas personas van en la cuenta (lo dice el primero que escanea el QR).
export const personasSchema = z.object({ personas: z.number().int().min(1).max(30) });
export const responderIngresoSchema = z.object({ aceptar: z.boolean() });
export const claveIngresoSchema = z.object({ clave: z.string().min(20).max(100) });
export const pedidosQuerySchema = z.object({ estado: estadoPedidoSchema.optional() });
export const itemsQuerySchema = z.object({ estado: estadoItemSchema.optional() });
export const llamadasQuerySchema = z.object({
  atendida: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

// Respuestas compartidas (las usan los frontends).
export type ModificadorElegido = { nombre: string; nombreEn: string | null; precioExtra: number };
export type ItemDetalle = {
  id: string;
  platoId: string;
  nombreEs: string;
  nombreEn: string;
  estacionId: string;
  cantidad: number;
  notas: string | null;
  precioUnitario: number;
  estado: EstadoItem;
  cancelado: boolean;
  motivoCancelacion: string | null;
  modificadores: ModificadorElegido[];
  pagoId: string | null; // cuentas separadas: grupo en el que se cobró
  updatedAt: string;
};
export type PagoDetalle = {
  id: string;
  nombre: string | null;
  metodoPago: MetodoPago;
  subtotal: number;
  montoServicio: number;
  montoIva: number;
  total: number;
  createdAt: string;
};
export type PedidoDetalle = {
  id: string;
  estado: EstadoPedido;
  origen: 'CLIENTE' | 'MESERO';
  nota: string | null;
  createdAt: string;
  confirmadoEn: string | null;
  updatedAt: string;
  items: ItemDetalle[];
};
export const tipoCuentaSchema = z.enum(['MESA', 'RECOGER', 'DOMICILIO']);
export type TipoCuenta = z.infer<typeof tipoCuentaSchema>;
export const etapaEnLineaSchema = z.enum([
  'RECIBIDO',
  'ACEPTADO',
  'LISTO',
  'EN_CAMINO',
  'ENTREGADO',
  'RECHAZADO',
]);
export type EtapaEnLinea = z.infer<typeof etapaEnLineaSchema>;
// Datos de un pedido en línea (para recoger o a domicilio).
export type DatosEnLinea = {
  numero: number;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string | null;
  referencia: string | null;
  costoEnvio: number;
  pagoElegido: MetodoPago | null;
  comprobanteSinpe: string | null;
  pagoVerificado: boolean;
  etapa: EtapaEnLinea;
  tiempoEstimadoMin: number | null;
  motivoRechazo: string | null;
};
export type CuentaDetalle = {
  id: string;
  estado: EstadoCuenta;
  mesa: { id: string; numero: number; nombre: string | null } | null; // null en pedidos en línea
  tipo: TipoCuenta;
  lugar: string; // "Mesa 3" o "Para llevar #12 · Ana"
  enLinea: DatosEnLinea | null;
  verificada: boolean;
  subtotal: number;
  montoServicio: number;
  montoIva: number;
  total: number;
  metodoPago: MetodoPago | null;
  abiertaEn: string;
  cerradaEn: string | null;
  personas: number | null;
  ingresoBloqueado: boolean;
  pagos: PagoDetalle[];
  updatedAt: string;
  pedidos: PedidoDetalle[];
};

export type EstadoMesa = 'LIBRE' | 'OCUPADA' | 'PEDIDO_PENDIENTE' | 'PIDIO_CUENTA' | 'LLAMADA';
export type MesaOperacion = {
  id: string;
  numero: number;
  nombre: string | null;
  estado: EstadoMesa; // el más urgente
  cuenta: {
    id: string;
    estado: EstadoCuenta;
    total: number;
    abiertaEn: string;
    pedidosPendientes: number;
    personas: number | null;
  } | null;
  llamadasActivas: number;
};

// Pantalla de estación: ítems activos agrupados por pedido.
export type SeguimientoEnLinea = {
  restaurante: {
    nombre: string;
    slug: string;
    logoUrl: string | null;
    colorAcento: string | null;
    telefono: string | null;
    moneda: Moneda;
    sinpeNumero: string | null;
    sinpeNombre: string | null;
    porcentajeIva: number;
    preciosIncluyenImpuestos: boolean;
  };
  cuenta: CuentaDetalle;
};

export type PedidoEstacion = {
  pedidoId: string;
  mesa: { numero: number; nombre: string | null } | null; // null en pedidos en línea
  lugar: string; // lo que se muestra en la tarjeta: "Mesa 3", "Para llevar #12 · Ana"
  confirmadoEn: string;
  nota: string | null;
  items: ItemDetalle[];
};

// --- Reportes ---

// Un pedido es "demorado" si tarda más que esto en quedar listo (igual que el rojo de cocina).
export const MINUTOS_DEMORA = 20;

const fechaLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
// Días locales del restaurante, ambos incluidos.
export const reporteQuerySchema = z
  .object({ desde: fechaLocal, hasta: fechaLocal })
  .refine((r) => r.desde <= r.hasta, 'La fecha inicial no puede ser después de la final')
  .refine(
    (r) => (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000 <= 366,
    'El rango máximo es de un año',
  );
export type ReporteQuery = z.infer<typeof reporteQuerySchema>;

export type Reporte = {
  desde: string;
  hasta: string;
  resumen: { totalVendido: number; cuentas: number; ticketPromedio: number };
  porDia: { dia: string; total: number; cuentas: number }[];
  porHora: { hora: number; total: number; cuentas: number }[];
  porMetodo: { metodo: string; total: number; cuentas: number }[];
  porCategoria: { categoria: string; cantidad: number; total: number }[];
  topPlatos: { platoId: string; nombre: string; cantidad: number; total: number }[];
  vistasVsPedidos: { platoId: string; nombre: string; vistas: number; pedidos: number }[];
  preparacion: { estacion: string; items: number; promedioSeg: number; demorados: number }[];
  cancelaciones: { motivo: string; items: number }[];
  porCanal: { canal: TipoCuenta; total: number; cuentas: number }[];
};

export type ReporteHoy = {
  desde: string;
  totalVendido: number;
  cuentasCerradas: number;
  ticketPromedio: number;
  topPlatos: { platoId: string; nombreEs: string; cantidad: number }[];
  tiempoPromedioPreparacionSeg: number | null;
};

export * from './avisos';
export * from './mapa';
export * from './totales';
export * from './seleccion';
export * from './horario';
export * from './color';
