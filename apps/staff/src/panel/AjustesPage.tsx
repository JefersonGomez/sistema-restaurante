import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Globe,
  Plus,
  Receipt,
  SlidersHorizontal,
  Trash2,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Fragment, useState, type ReactNode } from 'react';
import {
  incluyeMesas,
  restauranteConfigSchema,
  type Idioma,
  type ModoConfirmacion,
  type Moneda,
} from '@menu-qr/shared';
import { api, type ErrorApi } from '../api';
import { useAuth } from '../auth';
import { AjustesEnLinea, type ConfigEnLinea } from './AjustesEnLinea';
import { AjustesFactura } from './menu/FacturaPlato';
import { AjustesHacienda } from './AjustesHacienda';
import {
  Boton,
  Campo,
  ErrorCarga,
  erroresDe,
  Esqueleto,
  Interruptor,
  Tarjeta,
  TituloPagina,
} from './comunes';

type Turno = { diaSemana: number; abre: string; cierra: string };

// Wi-Fi del local: sale como un segundo QR en las tarjetas de las mesas (clientes sin datos).
function AjustesWifi({ r }: { r: { wifiNombre: string | null; wifiClave: string | null } }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(r.wifiNombre ?? '');
  const [clave, setClave] = useState(r.wifiClave ?? '');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const guardar = useMutation({
    mutationFn: () =>
      api('/restaurante', {
        method: 'PATCH',
        body: { wifiNombre: nombre.trim() || null, wifiClave: clave || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurante'] });
      setAviso({ ok: true, texto: 'Guardado. Vuelva a descargar el PDF de QR en Mesas y QR.' });
    },
    onError: (e: ErrorApi) => setAviso({ ok: false, texto: e.message }),
  });
  return (
    <Tarjeta className="space-y-3">
      <div>
        <h2 className="font-semibold">Wi-Fi para los clientes</h2>
        <p className="text-sm text-muted">
          Si lo anota, las tarjetas de las mesas llevan un segundo QR para conectarse al Wi-Fi con
          un toque. Ayuda a los clientes que no tienen datos en el celular.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre de la red"
          value={nombre}
          maxLength={32}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Clave (vacía si la red es abierta)"
          value={clave}
          maxLength={63}
          onChange={(e) => setClave(e.target.value)}
        />
      </div>
      {aviso && <p className={`text-sm ${aviso.ok ? 'text-ok' : 'text-danger'}`}>{aviso.texto}</p>}
      <Boton onClick={() => guardar.mutate()} disabled={guardar.isPending}>
        Guardar Wi-Fi
      </Boton>
    </Tarjeta>
  );
}
type Restaurante = {
  nombre: string;
  plan: 'EN_LINEA' | 'BASICO' | 'COMPLETO';
  wifiNombre: string | null;
  wifiClave: string | null;
  cabysGeneral: string | null;
  logoUrl: string | null;
  colorAcento: string | null;
  moneda: Moneda;
  idiomas: Idioma[];
  porcentajeIva: number;
  porcentajeServicio: number;
  preciosIncluyenImpuestos: boolean;
  modoConfirmacion: ModoConfirmacion;
  zonaHoraria: string;
  cerradoManual: boolean;
  platoDestacadoId: string | null;
  textoPromoEs: string | null;
  textoPromoEn: string | null;
  precioPromo: number | null;
  horarios: Turno[];
} & ConfigEnLinea;

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const diaDe = (i: number) => (i + 1) % 7; // índice de la lista (lunes primero) → diaSemana (0 = domingo)
// Con el interruptor encendido (Fase 20.4): qué pedidos revisa el mesero.
const MODOS: { id: ModoConfirmacion; texto: string }[] = [
  { id: 'PRIMER_PEDIDO', texto: 'Solo el primero de cada mesa (para saber que la mesa es real)' },
  { id: 'SIEMPRE', texto: 'Todos los pedidos' },
];
const select = 'mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-fg';

function Seccion({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle?: string;
  children: ReactNode;
}) {
  return (
    <Tarjeta className="space-y-3">
      <div>
        <h2 className="font-semibold">{titulo}</h2>
        {detalle && <p className="text-sm text-muted">{detalle}</p>}
      </div>
      {children}
    </Tarjeta>
  );
}

function Horarios({ inicial }: { inicial: Turno[] }) {
  const qc = useQueryClient();
  const [turnos, setTurnos] = useState(inicial);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);
  const guardar = useMutation({
    mutationFn: () => api('/restaurante/horarios', { method: 'PUT', body: { turnos } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurante'] });
      setGuardado(true);
    },
    onError: (e: ErrorApi) => setError(e.message),
  });
  const cambiar = (t: Turno, cambio: Partial<Turno>) => {
    setGuardado(false);
    setTurnos((ts) => ts.map((x) => (x === t ? { ...x, ...cambio } : x)));
  };
  const enviar = () => {
    // Si cierra antes de abrir, se entiende que cierra después de medianoche (lo permite la API).
    if (turnos.some((t) => t.abre === t.cierra))
      return setError('Un turno no puede abrir y cerrar a la misma hora');
    setError('');
    guardar.mutate();
  };

  return (
    <Seccion
      titulo="Horario de atención"
      detalle="Puede poner varios turnos por día (ej. almuerzo y cena). Fuera de horario el menú se ve, pero no recibe pedidos."
    >
      <ul className="grid xl:grid-cols-2 xl:gap-x-10">
        {DIAS.map((nombre, i) => {
          const dia = diaDe(i);
          const delDia = turnos.filter((t) => t.diaSemana === dia);
          return (
            <li key={dia} className="flex flex-wrap items-center gap-2 border-b border-line py-2">
              <span className="w-24 font-medium">{nombre}</span>
              <div className="flex flex-1 flex-col gap-2">
                {delDia.length === 0 && <span className="text-sm text-muted">Cerrado</span>}
                {delDia.map((t, j) => (
                  <span key={j} className="flex items-center gap-2">
                    <input
                      type="time"
                      aria-label={`${nombre}: abre`}
                      value={t.abre}
                      onChange={(e) => cambiar(t, { abre: e.target.value })}
                      className="h-11 rounded-xl border border-line bg-surface px-2"
                    />
                    <span className="text-muted">a</span>
                    <input
                      type="time"
                      aria-label={`${nombre}: cierra`}
                      value={t.cierra}
                      onChange={(e) => cambiar(t, { cierra: e.target.value })}
                      className="h-11 rounded-xl border border-line bg-surface px-2"
                    />
                    <button
                      type="button"
                      aria-label={`Quitar turno del ${nombre}`}
                      onClick={() => setTurnos((ts) => ts.filter((x) => x !== t))}
                      className="grid size-11 place-items-center rounded-md hover:bg-surface"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setTurnos((ts) => [
                    ...ts,
                    { diaSemana: dia, abre: delDia.at(-1)?.cierra ?? '11:00', cierra: '22:00' },
                  ])
                }
                className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-purple hover:bg-purple-soft"
              >
                <Plus className="size-4" aria-hidden /> Turno
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Boton onClick={enviar} disabled={guardar.isPending}>
          Guardar horario
        </Boton>
        {guardado && (
          <span role="status" className="text-sm text-ok">
            Horario guardado
          </span>
        )}
      </div>
    </Seccion>
  );
}

function Formulario({ r }: { r: Restaurante }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    moneda: r.moneda,
    idiomas: r.idiomas,
    porcentajeIva: String(r.porcentajeIva),
    porcentajeServicio: String(r.porcentajeServicio),
    preciosIncluyenImpuestos: r.preciosIncluyenImpuestos,
    modoConfirmacion: r.modoConfirmacion,
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);
  const poner = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setGuardado(false);
    setErrores(({ [k]: _, ...resto }) => resto);
    setF((x) => ({ ...x, [k]: v }));
  };

  const guardar = useMutation({
    mutationFn: (body: object) => api<Restaurante>('/restaurante', { method: 'PATCH', body }),
    onSuccess: (nuevo) => {
      qc.setQueryData(['restaurante'], nuevo);
      setGuardado(true);
    },
    onError: (e: ErrorApi) => setErrores({ general: e.message }),
  });
  const enviar = () => {
    const r = restauranteConfigSchema.safeParse({
      ...f,
      porcentajeIva: Number(f.porcentajeIva),
      porcentajeServicio: Number(f.porcentajeServicio),
    });
    if (!r.success) return setErrores(erroresDe(r.error));
    guardar.mutate(r.data);
  };

  // Contenedor propio: así la barra fija de "Guardar cambios" no tapa otras secciones.
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <Seccion titulo="Idiomas y moneda">
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1 font-medium">Idiomas del menú</legend>
            {(['es', 'en'] as const).map((i) => (
              <label key={i} className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5 accent-purple"
                  checked={f.idiomas.includes(i)}
                  onChange={() =>
                    poner(
                      'idiomas',
                      f.idiomas.includes(i) ? f.idiomas.filter((x) => x !== i) : [...f.idiomas, i],
                    )
                  }
                />
                {i === 'es' ? 'Español' : 'Inglés'}
              </label>
            ))}
          </fieldset>
          {errores.idiomas && <p className="text-sm text-danger">Elija al menos un idioma</p>}
          <label className="block max-w-xs text-sm">
            <span className="font-medium">Moneda</span>
            <select
              value={f.moneda}
              onChange={(e) => poner('moneda', e.target.value as Moneda)}
              className={select}
            >
              <option value="CRC">Colones (₡)</option>
              <option value="USD">Dólares ($)</option>
            </select>
          </label>
        </Seccion>

        <Seccion titulo="Impuestos" detalle="El servicio se calcula sobre el precio sin IVA.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="IVA (%)"
              type="number"
              min={0}
              max={100}
              value={f.porcentajeIva}
              onChange={(e) => poner('porcentajeIva', e.target.value)}
              error={errores.porcentajeIva}
            />
            <Campo
              etiqueta="Servicio (%)"
              type="number"
              min={0}
              max={100}
              value={f.porcentajeServicio}
              onChange={(e) => poner('porcentajeServicio', e.target.value)}
              error={errores.porcentajeServicio}
            />
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span>Los precios del menú ya incluyen el IVA</span>
            <Interruptor
              activo={f.preciosIncluyenImpuestos}
              etiqueta="Los precios incluyen IVA"
              onCambio={(v) => poner('preciosIncluyenImpuestos', v)}
            />
          </label>
        </Seccion>

        {r.plan !== 'EN_LINEA' && (
          <Seccion
            titulo="Pedidos desde el QR de la mesa"
            detalle="Por defecto van directo a cocina. Encienda esto si prefiere que un mesero los revise antes."
          >
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span>El mesero revisa los pedidos del cliente antes de cocina</span>
              <Interruptor
                activo={f.modoConfirmacion !== 'NUNCA'}
                etiqueta="El mesero revisa los pedidos del cliente"
                onCambio={(v) => poner('modoConfirmacion', v ? 'PRIMER_PEDIDO' : 'NUNCA')}
              />
            </label>
            {f.modoConfirmacion !== 'NUNCA' && (
              <fieldset className="mt-1 space-y-1 border-l-2 border-line pl-3 text-sm">
                <legend className="sr-only">Qué pedidos revisa el mesero</legend>
                {MODOS.map((m) => (
                  <label key={m.id} className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="modo"
                      className="size-5 accent-purple"
                      checked={f.modoConfirmacion === m.id}
                      onChange={() => poner('modoConfirmacion', m.id)}
                    />
                    {m.texto}
                  </label>
                ))}
              </fieldset>
            )}
          </Seccion>
        )}
      </div>

      <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-lg bg-app p-3 shadow-tarjeta">
        <Boton onClick={enviar} disabled={guardar.isPending}>
          Guardar cambios
        </Boton>
        {guardado && (
          <span role="status" className="text-sm text-ok">
            Cambios guardados
          </span>
        )}
        {errores.general && (
          <span role="alert" className="text-sm text-danger">
            {errores.general}
          </span>
        )}
      </div>
    </div>
  );
}

type IdSeccion = 'horario' | 'general' | 'en-linea' | 'wifi' | 'factura';
// Fase 20.7: lo básico arriba; lo que no hace falta para empezar, en "Opcional".
const SECCIONES: {
  id: IdSeccion;
  texto: string;
  detalle: string;
  icono: LucideIcon;
  opcional?: boolean;
  conMesas?: boolean;
}[] = [
  {
    id: 'horario',
    texto: 'Horario',
    detalle: 'Turnos de atención y cerrar temporalmente',
    icono: Clock,
  },
  {
    id: 'general',
    texto: 'General',
    detalle: 'Idiomas, moneda e impuestos',
    icono: SlidersHorizontal,
  },
  {
    id: 'en-linea',
    texto: 'Pedidos en línea',
    detalle: 'Recoger, domicilio, SINPE y sellos',
    icono: Globe,
  },
  {
    id: 'wifi',
    texto: 'Wi-Fi',
    detalle: 'QR para conectarse desde la mesa',
    icono: Wifi,
    opcional: true,
    conMesas: true,
  },
  {
    id: 'factura',
    texto: 'Factura electrónica',
    detalle: 'CABYS y datos de Hacienda',
    icono: Receipt,
    opcional: true,
  },
];

export function AjustesPage() {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const conMesas = incluyeMesas(usuario?.restaurante?.plan ?? 'COMPLETO');
  const visibles = SECCIONES.filter((x) => conMesas || !x.conMesas);
  // La sección elegida queda en la dirección (?seccion=…) para volver directo.
  const [params, setParams] = useSearchParams();
  const seccion = visibles.find((x) => x.id === params.get('seccion')) ?? visibles[0]!;
  const restaurante = useQuery({
    queryKey: ['restaurante'],
    queryFn: () => api<Restaurante>('/restaurante'),
  });
  const cerrar = useMutation({
    mutationFn: (cerradoManual: boolean) =>
      api<Restaurante>('/restaurante', { method: 'PATCH', body: { cerradoManual } }),
    onSuccess: (r) => qc.setQueryData(['restaurante'], r),
  });

  if (restaurante.isError)
    return (
      <ErrorCarga
        mensaje="No se pudieron cargar los ajustes"
        onReintentar={() => restaurante.refetch()}
      />
    );
  const r = restaurante.data;

  const contenido = !r ? (
    <Esqueleto className="h-96" />
  ) : seccion.id === 'horario' ? (
    <>
      <Tarjeta
        className={`flex items-center justify-between gap-3 ${r.cerradoManual ? 'bg-amber-soft text-amber-ink' : ''}`}
      >
        <div>
          <p className="font-semibold">Cerrar temporalmente</p>
          <p className="text-sm">
            {r.cerradoManual
              ? 'El menú no recibe pedidos hasta que lo vuelva a abrir.'
              : 'Deja de recibir pedidos por el QR sin cambiar el horario.'}
          </p>
        </div>
        <Interruptor
          activo={r.cerradoManual}
          etiqueta="Cerrar temporalmente"
          disabled={cerrar.isPending}
          onCambio={(v) => cerrar.mutate(v)}
        />
      </Tarjeta>
      <Horarios inicial={r.horarios} />
    </>
  ) : seccion.id === 'general' ? (
    <Formulario r={r} />
  ) : seccion.id === 'wifi' ? (
    <AjustesWifi r={r} />
  ) : seccion.id === 'factura' ? (
    <>
      <AjustesFactura cabysGeneral={r.cabysGeneral} />
      <AjustesHacienda />
    </>
  ) : r.plan === 'BASICO' ? (
    <Tarjeta>
      <h2 className="font-semibold">Pedidos en línea</h2>
      <p className="mt-1 text-sm text-muted">
        Los pedidos en línea, el domicilio con repartidores, los clientes y la tarjeta de sellos
        vienen con el plan Completo. Escríbanos para cambiar de plan.
      </p>
    </Tarjeta>
  ) : (
    <AjustesEnLinea r={r} />
  );

  return (
    <>
      <TituloPagina titulo="Ajustes" detalle={seccion.detalle} />
      <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav
          aria-label="Secciones de ajustes"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
        >
          {visibles.map(({ id, texto, icono: Icono, opcional }, i) => {
            const activa = id === seccion.id;
            const primeraOpcional = opcional && !visibles[i - 1]?.opcional;
            return (
              <Fragment key={id}>
                {primeraOpcional && (
                  <p className="hidden px-3 pt-4 pb-1 text-xs font-medium tracking-wide text-muted uppercase lg:block">
                    Opcional
                  </p>
                )}
                <button
                  type="button"
                  aria-current={activa ? 'page' : undefined}
                  onClick={() => setParams({ seccion: id }, { replace: true })}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-left text-sm font-medium whitespace-nowrap ${
                    activa
                      ? 'bg-purple text-on-accent'
                      : 'text-muted hover:bg-surface hover:text-fg'
                  }`}
                >
                  <Icono className="size-4 shrink-0" aria-hidden /> {texto}
                </button>
              </Fragment>
            );
          })}
        </nav>
        <div key={seccion.id} className="anim-entrar min-w-0 space-y-4">
          {contenido}
        </div>
      </div>
    </>
  );
}
