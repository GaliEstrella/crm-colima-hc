import { apiFetch, ApiError } from '@/lib/api-client';
import type { SessionUser } from '@/features/auth/types';
import { medicoIdPorNombre, nombrePorMedicoId } from './config/medicos';
import { conValoresDeSistema, EMPTY_VALUES, type HistoriaClinicaValues } from './config/fields';
import { fromDbPayload, toDbPayload } from './lib/db-mapping';

export interface Expediente {
  folio: string;
  values: HistoriaClinicaValues;
  creadoEn: string;
  creadoPor: { id: string; nombre: string };
  actualizadoEn: string;
  actualizadoPor: { id: string; nombre: string };
}

export interface ExpedienteResumen {
  folio: string;
  fechaEstudios: string;
  nombreCompleto: string;
  curp: string;
  empresa: string;
  tipoExamenMotivo: string;
  actualizadoEn: string;
  actualizadoPor: { id: string; nombre: string };
}

export interface FiltrosExpedientes {
  q?: string;
  desde?: string;
  hasta?: string;
  tipo?: string;
  /** 1-indexada, como la página del backend. */
  page?: number;
  pageSize?: number;
}

export interface EstadisticasExpedientes {
  total: number;
  ultimos7Dias: number;
  hoy: number;
  editadosHoy: number;
  porTipo: Record<string, number>;
}

interface BackendExpediente {
  folio: number;
  values: Record<string, unknown>;
  creado_por: { id: string; nombre: string | null };
  actualizado_por: { id: string; nombre: string | null };
  created_at: string;
  updated_at: string;
}

function aExpediente(e: BackendExpediente): Expediente {
  const values = conValoresDeSistema(fromDbPayload(e.values));
  values.folio = String(e.folio);
  values.medicoDictaminador = nombrePorMedicoId(values.medicoDictaminador) || '';
  return {
    folio: String(e.folio),
    values,
    creadoEn: e.created_at,
    creadoPor: { id: e.creado_por.id, nombre: e.creado_por.nombre ?? '' },
    actualizadoEn: e.updated_at,
    actualizadoPor: { id: e.actualizado_por.id, nombre: e.actualizado_por.nombre ?? '' },
  };
}

/** Folio que asignaría el servidor ahora mismo; solo informativo, el real se asigna al guardar. */
export async function siguienteFolio(): Promise<string> {
  const { folio } = await apiFetch<{ folio: number }>('/expedientes/siguiente-folio');
  return String(folio);
}

/** Valores iniciales de una historia nueva: folio vacío (se completa al llegar la respuesta del servidor) y fecha de hoy. */
export function valoresNuevoExpediente(): HistoriaClinicaValues {
  const hoy = new Date();
  const fechaEstudios = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return conValoresDeSistema({ ...EMPTY_VALUES, fechaEstudios });
}

/** Navegador de expedientes: búsqueda, filtros y paginación los resuelve el servidor. */
export async function listExpedientes(
  filtros: FiltrosExpedientes = {},
): Promise<{ items: ExpedienteResumen[]; total: number }> {
  interface Fila {
    folio: number;
    fecha_estudios: string;
    nombre_completo: string | null;
    curp: string | null;
    empresa: string | null;
    tipo_examen_motivo: string | null;
    updated_at: string;
    actualizado_por: string | null;
  }
  const { items, total } = await apiFetch<{ items: Fila[]; total: number }>('/expedientes', {
    query: {
      q: filtros.q,
      desde: filtros.desde,
      hasta: filtros.hasta,
      tipo: filtros.tipo,
      page: filtros.page,
      page_size: filtros.pageSize,
    },
  });
  return {
    total,
    items: items.map((i) => ({
      folio: String(i.folio),
      fechaEstudios: i.fecha_estudios,
      nombreCompleto: i.nombre_completo ?? '',
      curp: i.curp ?? '',
      empresa: i.empresa ?? '',
      tipoExamenMotivo: i.tipo_examen_motivo ?? '',
      actualizadoEn: i.updated_at,
      actualizadoPor: { id: '', nombre: i.actualizado_por ?? '' },
    })),
  };
}

/** Tarjetas de métricas del navegador de expedientes. */
export async function obtenerEstadisticasExpedientes(): Promise<EstadisticasExpedientes> {
  const r = await apiFetch<{
    total: number;
    ultimos_7_dias: number;
    hoy: number;
    editados_hoy: number;
    por_tipo: Record<string, number>;
  }>('/expedientes/estadisticas');
  return { total: r.total, ultimos7Dias: r.ultimos_7_dias, hoy: r.hoy, editadosHoy: r.editados_hoy, porTipo: r.por_tipo };
}

/** Abre un expediente; el servidor deja constancia de la consulta en la bitácora. */
export async function abrirExpediente(folio: string, _user: SessionUser): Promise<Expediente | null> {
  try {
    const data = await apiFetch<BackendExpediente>(`/expedientes/${encodeURIComponent(folio)}`);
    return aExpediente(data);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Expedientes de una jornada (los realizados ese día, o editados ese día
 * aunque se hayan realizado antes), para construir el Excel diario.
 * Solo lo puede pedir un administrador.
 */
export async function obtenerJornada(fecha: string): Promise<Expediente[]> {
  const { items } = await apiFetch<{ fecha: string; items: BackendExpediente[] }>('/export/excel', {
    query: { fecha },
  });
  return items.map(aExpediente);
}

/**
 * Crea (yaExiste = false) o actualiza (yaExiste = true) un expediente. El
 * folio y la fecha de realización los asigna/conserva el servidor; el
 * detalle de qué cambió en una edición lo calcula y registra el servidor.
 */
export async function guardarExpediente(
  values: HistoriaClinicaValues,
  _user: SessionUser,
  yaExiste: boolean,
): Promise<Expediente> {
  const limpio = conValoresDeSistema(values);
  const payload = toDbPayload(limpio);
  // medicoDictaminador guarda el NOMBRE en el formulario; el backend espera el id del usuario.
  payload.medico_dictaminador = medicoIdPorNombre(limpio.medicoDictaminador) ?? null;

  const data = yaExiste
    ? await apiFetch<BackendExpediente>(`/expedientes/${encodeURIComponent(limpio.folio)}`, {
        method: 'PUT',
        body: payload,
      })
    : await apiFetch<BackendExpediente>('/expedientes', { method: 'POST', body: payload });

  return aExpediente(data);
}
