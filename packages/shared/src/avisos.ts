// Para avisos por tiempo (cocina demorada, platos esperando): avisa una sola vez por tanda y solo
// cuando aparecen ids nuevos; los que ya avisó no vuelven a sonar.
export function avisoAgrupado(
  yaAvisados: Set<string>,
  actuales: string[],
  aviso: (n: number) => void,
) {
  const nuevos = actuales.filter((id) => !yaAvisados.has(id));
  for (const id of [...yaAvisados]) if (!actuales.includes(id)) yaAvisados.delete(id);
  if (!nuevos.length) return;
  nuevos.forEach((id) => yaAvisados.add(id));
  aviso(actuales.length);
}
