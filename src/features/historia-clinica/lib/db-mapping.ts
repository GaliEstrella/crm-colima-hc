import type { HistoriaClinicaValues } from '../config/fields';

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Convierte los valores del formulario (camelCase) a las columnas de la base
 * de datos (snake_case). Ej.: tipoExamenMotivo → tipo_examen_motivo,
 * tipoExamenCategoria → tipo_examen_categoria, aud150Od → aud150_od.
 * Los vacíos se envían como null.
 */
export function toDbPayload(values: HistoriaClinicaValues): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [toSnake(k), v?.trim() ? v.trim() : null]),
  );
}
