import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  restauranteConfigSchema,
  type Idioma,
  type ModoConfirmacion,
  type Moneda,
} from '@menu-qr/shared';
import { api, type ErrorApi } from '../api';
import { AjustesEnLinea, type ConfigEnLinea } from './AjustesEnLinea';
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
type Restaurante = {
  nombre: string;
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
const MODOS: { id: ModoConfirmacion; texto: string }[] = [
  { id: 'SIEMPRE', texto: 'Siempre: el mesero confirma cada pedido' },
  { id: 'PRIMER_PEDIDO', texto: 'Solo el primer pedido de cada mesa' },
  { id: 'NUNCA', texto: 'Nunca: los pedidos van directo a cocina' },
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
      <ul className="divide-y divide-line">
        {DIAS.map((nombre, i) => {
          const dia = diaDe(i);
          const delDia = turnos.filter((t) => t.diaSemana === dia);
          return (
            <li key={dia} className="flex flex-wrap items-center gap-2 py-2">
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

      <Seccion
        titulo="Confirmación de pedidos"
        detalle="Cuándo tiene que aprobar un mesero lo que pide el cliente desde el QR."
      >
        <fieldset className="space-y-1 text-sm">
          <legend className="sr-only">Confirmación de pedidos</legend>
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
      </Seccion>

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

export function AjustesPage() {
  const qc = useQueryClient();
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
  return (
    <>
      <TituloPagina
        titulo="Ajustes"
        detalle="Horario, idiomas, moneda, impuestos, confirmación de pedidos y pedidos en línea."
      />
      {!r ? (
        <Esqueleto className="h-96" />
      ) : (
        <div className="max-w-3xl space-y-4">
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
          <Formulario r={r} />
          <AjustesEnLinea r={r} />
        </div>
      )}
    </>
  );
}
