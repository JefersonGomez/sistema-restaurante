// localStorage puede fallar (modo privado, bloqueado): la app funciona igual, solo sin recordar.

export function leer<T>(clave: string): T | null {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export function guardar(clave: string, valor: unknown) {
  try {
    if (valor === null || valor === undefined) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // sin almacenamiento
  }
}

// crypto.randomUUID no existe fuera de contextos seguros (http por la red local); getRandomValues sí.
export function nuevoId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
