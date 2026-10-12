import { delay, newId, readTable, writeTable } from '@/lib/local-db';
import type { SessionUser } from '@/features/auth/types';

export type AccionAuditoria = 'Creación de Folio' | 'Edición de Expediente' | 'Consulta';

export const ACCIONES: readonly AccionAuditoria[] = ['Creación de Folio', 'Edición de Expediente', 'Consulta'];

export interface EventoAuditoria {
  id: string;
  /** ISO 8601 con hora exacta */
  fecha: string;
  usuarioId: string;
  usuarioNombre: string;
  accion: AccionAuditoria;
  folio: string;
  paciente: string;
  detalle: string;
}

const TABLE = 'bitacora';
/** Tope del mock local; el backend debe conservar la bitácora completa. */
const MAX_EVENTOS = 5000;

/**
 * Registra un evento. En producción la bitácora la escribe el SERVIDOR en el
 * mismo endpoint que guarda o sirve el expediente, para que no se pueda omitir.
 */
export function registrarEvento(
  user: SessionUser,
  accion: AccionAuditoria,
  { folio, paciente, detalle }: { folio: string; paciente: string; detalle: string },
): void {
  const eventos = readTable<EventoAuditoria[]>(TABLE, []);
  eventos.unshift({
    id: newId(),
    fecha: new Date().toISOString(),
    usuarioId: user.id,
    usuarioNombre: user.nombre,
    accion,
    folio,
    paciente,
    detalle,
  });
  writeTable(TABLE, eventos.slice(0, MAX_EVENTOS));
}

/** Más recientes primero. */
export async function listEventos(): Promise<EventoAuditoria[]> {
  await delay(150);
  return readTable<EventoAuditoria[]>(TABLE, []);
}
