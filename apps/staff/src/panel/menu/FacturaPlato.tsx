import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { cabysSchema, TARIFAS_IVA, type ResultadoCabys } from '@menu-qr/shared';
import { api, type ErrorApi } from '../../api';
import { Boton, Tarjeta } from '../comunes';

const campo = 'mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-fg';

// Buscador del catálogo CABYS de Hacienda (vía nuestra API).
function BuscadorCabys({
  ejemplo,
  onElegir,
}: {
  ejemplo: string;
  onElegir: (r: ResultadoCabys) => void;
}) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<ResultadoCabys[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = async () => {
    if (q.trim().length < 3) return setError('Escriba al menos 3 letras');
    setBuscando(true);
    setError(null);
    try {
      setResultados(await api<ResultadoCabys[]>(`/platos/cabys?q=${encodeURIComponent(q.trim())}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar en el catálogo de Hacienda: ${ejemplo}`}
          aria-label="Buscar código CABYS"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm"
        />
        <Boton type="submit" variante="suave" disabled={buscando}>
          <Search className="size-4" aria-hidden /> {buscando ? 'Buscando…' : 'Buscar'}
        </Boton>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
      {resultados && (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line text-sm">
          {resultados.length === 0 && <li className="p-3 text-muted">Sin resultados.</li>}
          {resultados.map((r) => (
            <li key={r.codigo}>
              <button
                type="button"
                onClick={() => {
                  onElegir(r);
                  setResultados(null);
                }}
                className="flex min-h-11 w-full items-start gap-3 p-3 text-left hover:bg-surface"
              >
                <span className="flex-1">
                  {r.descripcion}
                  <span className="block text-xs text-muted tabular-nums">{r.codigo}</span>
                </span>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                  IVA {r.impuesto} %
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Datos del plato para la factura electrónica: CABYS propio (solo excepciones) y tarifa de IVA.
export function FacturaPlato({
  cabys,
  tarifaIva,
  ivaRestaurante,
  cabysGeneral,
  onCabys,
  onTarifa,
  error,
}: {
  cabys: string;
  tarifaIva: number | null;
  ivaRestaurante: number;
  cabysGeneral: string | null;
  onCabys: (codigo: string) => void;
  onTarifa: (t: number | null) => void;
  error?: string;
}) {
  const elegir = (r: ResultadoCabys) => {
    onCabys(r.codigo);
    // La tarifa que sugiere Hacienda para ese código, si es una de las que manejamos.
    if ((TARIFAS_IVA as readonly number[]).includes(r.impuesto))
      onTarifa(r.impuesto === ivaRestaurante ? null : r.impuesto);
  };

  return (
    <Tarjeta className="space-y-3">
      <div>
        <h2 className="font-semibold">Factura electrónica</h2>
        <p className="text-sm text-muted">
          Déjelo vacío para usar el código general del restaurante
          {cabysGeneral ? ` (${cabysGeneral})` : ' (se pone en Ajustes)'}. Llénelo solo para
          productos que se venden aparte, como café en grano o pan empacado.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Código CABYS propio (opcional)</span>
          <input
            inputMode="numeric"
            maxLength={13}
            value={cabys}
            placeholder={cabysGeneral ?? ''}
            onChange={(e) => onCabys(e.target.value.replace(/\D/g, ''))}
            className={`${campo} tabular-nums`}
            aria-invalid={!!error}
          />
          {error && <span className="mt-1 block text-danger">{error}</span>}
        </label>
        <label className="block text-sm">
          <span className="font-medium">Tarifa de IVA</span>
          <select
            value={tarifaIva ?? ''}
            onChange={(e) => onTarifa(e.target.value === '' ? null : Number(e.target.value))}
            className={campo}
          >
            <option value="">La del restaurante ({ivaRestaurante} %)</option>
            {TARIFAS_IVA.map((t) => (
              <option key={t} value={t}>
                {t === 0 ? '0 % (exento)' : `${t} %`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <BuscadorCabys ejemplo="«café tostado», «pan»…" onElegir={elegir} />
    </Tarjeta>
  );
}

// Códigos generales más comunes según cómo atiende el local.
const MODALIDADES = [
  { codigo: '6331000000000', texto: 'Restaurante con mesero' },
  { codigo: '6332000000000', texto: 'Sin mesero, con mesas (soda)' },
  { codigo: '6339900000000', texto: 'Mostrador, sin mesas' },
];

// Ajustes: código CABYS general del restaurante (lo usan los platos sin código propio).
export function AjustesFactura({ cabysGeneral }: { cabysGeneral: string | null }) {
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState(cabysGeneral ?? '');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const guardar = useMutation({
    mutationFn: () => {
      if (codigo && !cabysSchema.safeParse(codigo).success)
        throw new Error('El código CABYS tiene 13 dígitos');
      return api('/restaurante', { method: 'PATCH', body: { cabysGeneral: codigo || null } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurante'] });
      setAviso({ ok: true, texto: 'Guardado.' });
    },
    onError: (e: ErrorApi) => setAviso({ ok: false, texto: e.message }),
  });
  const elegir = (c: string) => {
    setCodigo(c);
    setAviso(null);
  };

  return (
    <Tarjeta className="space-y-3">
      <div>
        <h2 className="font-semibold">Factura electrónica · código CABYS general</h2>
        <p className="text-sm text-muted">
          Normalmente no se pone un código por platillo sino uno general según cómo atiende el
          local. Este código lo usan todos los platos que no tengan uno propio. Confírmelo con su
          contador.
        </p>
      </div>
      <div role="group" aria-label="Modalidad del local" className="flex flex-wrap gap-2">
        {MODALIDADES.map((m) => (
          <button
            key={m.codigo}
            type="button"
            aria-pressed={codigo === m.codigo}
            onClick={() => elegir(m.codigo)}
            className={`min-h-11 rounded-md px-3 text-left text-sm ${codigo === m.codigo ? 'bg-purple text-on-accent' : 'bg-surface hover:bg-surface-2'}`}
          >
            <span className="block font-semibold">{m.texto}</span>
            <span className="block text-xs tabular-nums opacity-80">{m.codigo}</span>
          </button>
        ))}
      </div>
      <label className="block text-sm">
        <span className="font-medium">Código CABYS general</span>
        <input
          inputMode="numeric"
          maxLength={13}
          value={codigo}
          onChange={(e) => elegir(e.target.value.replace(/\D/g, ''))}
          className={`${campo} block tabular-nums sm:max-w-xs`}
        />
      </label>
      <BuscadorCabys ejemplo="«suministro de comida»…" onElegir={(r) => elegir(r.codigo)} />
      {aviso && <p className={`text-sm ${aviso.ok ? 'text-ok' : 'text-danger'}`}>{aviso.texto}</p>}
      <Boton onClick={() => guardar.mutate()} disabled={guardar.isPending}>
        Guardar código
      </Boton>
    </Tarjeta>
  );
}
