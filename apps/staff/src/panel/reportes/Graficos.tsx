import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Gráfico de barras de una serie (ventas por día o por hora). Va en su propio archivo para
// cargar recharts solo al abrir Reportes. Colores con los tokens del tema (claro y oscuro).
export default function Barras({
  datos,
  etiqueta,
  precio,
}: {
  datos: { x: string; total: number; cuentas: number }[];
  etiqueta: string; // nombre del eje x en el tooltip ("Día", "Hora")
  precio: (c: number) => string;
}) {
  // Pocas barras: más gruesas; muchas: se adelgazan solas.
  const ancho = datos.length > 20 ? undefined : 28;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis
          dataKey="x"
          tickLine={false}
          axisLine={{ stroke: 'var(--line)' }}
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={72}
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          tickFormatter={(v: number) => precio(v)}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
          contentStyle={{
            background: 'var(--app)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            color: 'var(--fg)',
          }}
          labelFormatter={(x) => `${etiqueta}: ${x}`}
          formatter={(v: number, _n, item) => [
            `${precio(v)} · ${item.payload.cuentas} cuenta(s)`,
            'Ventas',
          ]}
        />
        <Bar dataKey="total" fill="var(--purple)" radius={[4, 4, 0, 0]} maxBarSize={ancho} />
      </BarChart>
    </ResponsiveContainer>
  );
}
