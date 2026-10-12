import { apiFetch } from '@/lib/api-client';

export type AccionAuditoria = 'Creación de Folio' | 'Edición de Expediente' | 'Consulta';

export const ACCIONES: readonly AccionAuditoria[] = ['Creación de Folio', 'Edición de Expediente', 'Consulta'];

export interface EventoAuditoria {
  id: string;
  /** ISO 8601 con hora exacta */
  fecha: string;
  usuarioNombre: string;
  accion: AccionAuditoria;
  folio: string;
  paciente: string;
  detalle: string;
}

export interface FiltrosBitacora {
  accion?: AccionAuditoria | '';
  fecha?: string;
  q?: string;
  page?: number;
}

interface FilaBackend {
  fecha: string;
  usuario_nombre: string;
  accion: AccionAuditoria;
  folio: number;
  paciente: string | null;
  detalle: string;
}

const aEvento = (f: FilaBackend, i: number): EventoAuditoria => ({
  // El backend no manda un id propio por fila; alcanza con que sea único en esta página.
  id: `${f.folio}-${f.fecha}-${i}`,
  fecha: f.fecha,
  usuarioNombre: f.usuario_nombre,
  accion: f.accion,
  folio: String(f.folio),
  paciente: f.paciente ?? '',
  detalle: f.detalle,
});

/** Más recientes primero. El servidor escribe la bitácora; aquí solo se consulta. */
export async function listEventos(filtros: FiltrosBitacora = {}): Promise<{ items: EventoAuditoria[]; total: number }> {
  const { items, total } = await apiFetch<{ items: FilaBackend[]; total: number }>('/bitacora', {
    query: { accion: filtros.accion || undefined, fecha: filtros.fecha, q: filtros.q, page: filtros.page },
  });
  return { items: items.map(aEvento), total };
}
