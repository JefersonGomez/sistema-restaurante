import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, PlugZap, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  configHaciendaSchema,
  TIPOS_IDENTIFICACION,
  type ConfigHaciendaInput,
  type ConfigHaciendaVista,
  type Contribuyente,
} from '@menu-qr/shared';
import { api, type ErrorApi } from '../api';
import { Boton, Campo, erroresDe, Interruptor, Tarjeta } from './comunes';

type Form = Omit<ConfigHaciendaInput, 'provincia' | 'canton' | 'distrito'> & {
  provincia: string;
  canton: string;
  distrito: string;
};
const VACIO: Form = {
  activa: false,
  ambiente: 'pruebas',
  tipoId: '01',
  numeroId: '',
  nombre: '',
  nombreComercial: null,
  correo: '',
  provincia: '',
  canton: '',
  distrito: '',
  otrasSenas: '',
  actividad: '',
};
const selectClase = 'mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-fg';

// Lee el archivo .p12 como base64 (sin el prefijo data:).
const aBase64 = (f: File) =>
  new Promise<string>((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => mal(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(f);
  });

// Factura electrónica (Fase 15.3): datos de Hacienda del restaurante.
export function AjustesHacienda() {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ['hacienda'],
    queryFn: () => api<ConfigHaciendaVista | null>('/hacienda/config'),
  });
  const [f, setF] = useState<Form>(VACIO);
  const [secretos, setSecretos] = useState({ usuario: '', clave: '', pin: '' });
  const [llave, setLlave] = useState<{ nombre: string; base64: string } | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [actividades, setActividades] = useState<Contribuyente['actividades']>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const c = config.data;
    if (!c) return;
    const { tieneCredenciales: _t, tieneLlave: _l, llaveVence: _v, ...resto } = c;
    setF({
      ...resto,
      provincia: String(c.provincia),
      canton: String(c.canton),
      distrito: String(c.distrito),
    });
  }, [config.data]);

  const poner = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrores(({ [k as string]: _q, ...r }) => r);
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const cuerpo = {
        ...f,
        provincia: Number(f.provincia),
        canton: Number(f.canton),
        distrito: Number(f.distrito),
        nombreComercial: f.nombreComercial?.trim() || null,
        ...(secretos.usuario.trim() && { usuario: secretos.usuario.trim() }),
        ...(secretos.clave && { clave: secretos.clave }),
        ...(secretos.pin && { pin: secretos.pin }),
        ...(llave && { llaveP12: llave.base64 }),
      };
      const p = configHaciendaSchema.safeParse(cuerpo);
      if (!p.success) {
        setErrores(erroresDe(p.error));
        throw new Error('Revise los campos marcados');
      }
      return api<ConfigHaciendaVista>('/hacienda/config', { method: 'PUT', body: p.data });
    },
    onSuccess: (c) => {
      qc.setQueryData(['hacienda'], c);
      setSecretos({ usuario: '', clave: '', pin: '' });
      setLlave(null);
      setAviso({ ok: true, texto: 'Guardado.' });
    },
    onError: (e: ErrorApi) => setAviso({ ok: false, texto: e.message }),
  });
  const probar = useMutation({
    mutationFn: () => api<{ ok: boolean; mensaje: string }>('/hacienda/probar', { method: 'POST' }),
    onSuccess: (r) => setAviso({ ok: r.ok, texto: r.mensaje }),
    onError: (e: ErrorApi) => setAviso({ ok: false, texto: e.message }),
  });

  // Nombre y actividades inscritas, desde el registro público de Hacienda.
  const buscarMisDatos = async () => {
    setBuscando(true);
    setAviso(null);
    try {
      const c = await api<Contribuyente>(`/comprobantes/contribuyente?id=${f.numeroId}`);
      setF((x) => ({
        ...x,
        nombre: c.nombre,
        tipoId: (['01', '02', '03', '04'].includes(c.tipoId)
          ? c.tipoId
          : x.tipoId) as Form['tipoId'],
        actividad: x.actividad || c.actividades[0]?.codigo || '',
      }));
      setActividades(c.actividades);
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setBuscando(false);
    }
  };

  const c = config.data;
  return (
    <Tarjeta className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Factura electrónica · Hacienda</h2>
          <p className="text-sm text-muted">
            Con esto activo, cada cobro genera su tiquete o factura y se envía solo a Hacienda. Los
            datos se guardan cifrados; la clave, la llave y el PIN no se vuelven a mostrar.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-sm font-medium">
          <Interruptor
            activo={f.activa}
            etiqueta="Factura electrónica activa"
            onCambio={(v) => poner('activa', v)}
          />
          {f.activa ? 'Activa' : 'Apagada'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium">Ambiente</span>
          <select
            value={f.ambiente}
            onChange={(e) => poner('ambiente', e.target.value as Form['ambiente'])}
            className={selectClase}
          >
            <option value="pruebas">Pruebas (sin validez fiscal)</option>
            <option value="produccion">Producción</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Tipo de identificación</span>
          <select
            value={f.tipoId}
            onChange={(e) => poner('tipoId', e.target.value as Form['tipoId'])}
            className={selectClase}
          >
            {TIPOS_IDENTIFICACION.map((t) => (
              <option key={t.id} value={t.id}>
                {t.texto}
              </option>
            ))}
          </select>
        </label>
        <div className="text-sm">
          <Campo
            etiqueta="Número (sin guiones)"
            inputMode="numeric"
            value={f.numeroId}
            onChange={(e) => poner('numeroId', e.target.value.replace(/\D/g, ''))}
            error={errores.numeroId}
          />
        </div>
      </div>
      <Boton variante="suave" disabled={buscando || f.numeroId.length < 9} onClick={buscarMisDatos}>
        <Search className="size-4" aria-hidden />
        {buscando ? 'Buscando…' : 'Traer mi nombre y actividades de Hacienda'}
      </Boton>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre legal (como está en Hacienda)"
          value={f.nombre}
          onChange={(e) => poner('nombre', e.target.value)}
          error={errores.nombre}
        />
        <Campo
          etiqueta="Nombre comercial (opcional)"
          value={f.nombreComercial ?? ''}
          onChange={(e) => poner('nombreComercial', e.target.value)}
        />
        <Campo
          etiqueta="Correo del emisor"
          type="email"
          value={f.correo}
          onChange={(e) => poner('correo', e.target.value)}
          error={errores.correo}
        />
        <div>
          <Campo
            etiqueta="Actividad económica (CIIU 4, ej. 5610.0)"
            value={f.actividad}
            onChange={(e) => poner('actividad', e.target.value)}
            error={errores.actividad}
          />
          {actividades.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {actividades.map((a) => (
                <button
                  key={a.codigo}
                  type="button"
                  aria-pressed={f.actividad === a.codigo}
                  onClick={() => poner('actividad', a.codigo)}
                  className={`min-h-11 rounded-md px-3 text-left text-xs ${f.actividad === a.codigo ? 'bg-purple text-on-accent' : 'bg-surface hover:bg-surface-2'}`}
                >
                  <span className="font-semibold tabular-nums">{a.codigo}</span> · {a.descripcion}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,110px))_1fr]">
        <Campo
          etiqueta="Provincia"
          inputMode="numeric"
          value={f.provincia}
          onChange={(e) => poner('provincia', e.target.value.replace(/\D/g, ''))}
          error={errores.provincia}
        />
        <Campo
          etiqueta="Cantón"
          inputMode="numeric"
          value={f.canton}
          onChange={(e) => poner('canton', e.target.value.replace(/\D/g, ''))}
          error={errores.canton}
        />
        <Campo
          etiqueta="Distrito"
          inputMode="numeric"
          value={f.distrito}
          onChange={(e) => poner('distrito', e.target.value.replace(/\D/g, ''))}
          error={errores.distrito}
        />
        <Campo
          etiqueta="Otras señas"
          value={f.otrasSenas}
          onChange={(e) => poner('otrasSenas', e.target.value)}
          error={errores.otrasSenas}
        />
      </div>

      <div className="space-y-3 rounded-lg bg-surface/60 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4" aria-hidden /> Acceso a Hacienda
          <span className="font-normal text-muted">
            {c?.tieneCredenciales ? '· usuario y clave guardados' : '· sin usuario y clave'}
            {c?.tieneLlave
              ? ` · llave guardada${c.llaveVence ? `, vence ${new Date(c.llaveVence).toLocaleDateString('es-CR')}` : ''}`
              : ' · sin llave'}
          </span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta={
              c?.tieneCredenciales
                ? 'Usuario de la API (dejar vacío para no cambiarlo)'
                : 'Usuario de la API'
            }
            value={secretos.usuario}
            autoComplete="off"
            onChange={(e) => setSecretos((s) => ({ ...s, usuario: e.target.value }))}
          />
          <Campo
            etiqueta={
              c?.tieneCredenciales
                ? 'Clave de la API (dejar vacía para no cambiarla)'
                : 'Clave de la API'
            }
            type="password"
            autoComplete="new-password"
            value={secretos.clave}
            onChange={(e) => setSecretos((s) => ({ ...s, clave: e.target.value }))}
          />
          <label className="block text-sm">
            <span className="font-medium">Llave criptográfica (.p12)</span>
            <input
              type="file"
              accept=".p12,application/x-pkcs12"
              onChange={async (e) => {
                const archivo = e.target.files?.[0];
                if (archivo) setLlave({ nombre: archivo.name, base64: await aBase64(archivo) });
              }}
              className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:font-medium"
            />
          </label>
          <Campo
            etiqueta="PIN de la llave"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={secretos.pin}
            onChange={(e) => setSecretos((s) => ({ ...s, pin: e.target.value }))}
          />
        </div>
      </div>

      {aviso && <p className={`text-sm ${aviso.ok ? 'text-ok' : 'text-danger'}`}>{aviso.texto}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton onClick={() => guardar.mutate()} disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar datos de Hacienda'}
        </Boton>
        <Boton
          variante="suave"
          disabled={!c?.tieneCredenciales || probar.isPending}
          onClick={() => probar.mutate()}
        >
          <PlugZap className="size-4" aria-hidden />{' '}
          {probar.isPending ? 'Probando…' : 'Probar conexión'}
        </Boton>
      </div>
    </Tarjeta>
  );
}
