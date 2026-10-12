import { delay, readTable, todayIso, writeTable } from '@/lib/local-db';
import type { SessionUser } from '@/features/auth/types';
import { registrarEvento } from '@/features/auditoria/api';
import { ALL_FIELDS, conValoresDeSistema, EMPTY_VALUES, type HistoriaClinicaValues } from './config/fields';

/**
 * MOCK de expedientes. En producción: GET/POST/PUT /api/expedientes enviando
 * `toDbPayload(values)` (columnas snake_case). El folio lo asigna el servidor
 * dentro de una transacción para que dos capturas simultáneas no lo repitan.
 */

export interface Expediente {
  folio: string;
  values: HistoriaClinicaValues;
  creadoEn: string;
  creadoPor: { id: string; nombre: string };
  actualizadoEn: string;
  actualizadoPor: { id: string; nombre: string };
}

const TABLE = 'expedientes';
/**
 * Solo los campos vigentes: los expedientes guardados antes de retirar R3, R5 y R7
 * (lugarCertificacion, clasificacionPeco, magnitudRiesgo) los pierden al releerse.
 */
const soloCamposVigentes = (values: Record<string, string>): HistoriaClinicaValues =>
  conValoresDeSistema(Object.fromEntries(ALL_FIELDS.map((f) => [f.key, values[f.key] ?? ''])) as HistoriaClinicaValues);

const loadAll = () =>
  readTable<Expediente[]>(TABLE, []).map((e) => ({ ...e, values: soloCamposVigentes(e.values) }));

/** Siguiente folio consecutivo (el mayor folio numérico + 1). */
export function siguienteFolio(): string {
  const max = loadAll().reduce((m, e) => Math.max(m, Number(e.folio) || 0), 0);
  return String(max + 1);
}

/** Valores iniciales de una historia nueva: folio consecutivo y fecha de hoy. */
export function valoresNuevoExpediente(): HistoriaClinicaValues {
  return conValoresDeSistema({ ...EMPTY_VALUES, folio: siguienteFolio(), fechaEstudios: todayIso() });
}

export async function listExpedientes(): Promise<Expediente[]> {
  await delay(150);
  return loadAll().sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
}

/** Abre un expediente y deja constancia de la consulta en la bitácora. */
export async function abrirExpediente(folio: string, user: SessionUser): Promise<Expediente | null> {
  await delay(150);
  const exp = loadAll().find((e) => e.folio === folio) ?? null;
  if (exp) {
    registrarEvento(user, 'Consulta', {
      folio,
      paciente: exp.values.nombreCompleto,
      detalle: 'Apertura del expediente',
    });
  }
  return exp;
}

const LABEL = new Map(ALL_FIELDS.map((f) => [f.key, `${f.code} ${f.label}`]));

function camposModificados(antes: HistoriaClinicaValues, despues: HistoriaClinicaValues): string {
  const cambios = ALL_FIELDS.filter((f) => (antes[f.key] ?? '').trim() !== (despues[f.key] ?? '').trim()).map(
    (f) => LABEL.get(f.key)!,
  );
  if (!cambios.length) return 'Guardado sin cambios';
  const visibles = cambios.slice(0, 6).join(', ');
  return cambios.length > 6 ? `${visibles} y ${cambios.length - 6} más` : visibles;
}

/**
 * Crea (folio vacío o inexistente) o actualiza un expediente. Al crear se
 * asigna el folio consecutivo en ese momento, aunque la pantalla mostrara otro.
 */
export async function guardarExpediente(
  values: HistoriaClinicaValues,
  user: SessionUser,
): Promise<Expediente> {
  await delay(400);
  const all = loadAll();
  const ahora = new Date().toISOString();
  const quien = { id: user.id, nombre: user.nombre };
  const limpio = conValoresDeSistema(
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, (v ?? '').trim()])) as HistoriaClinicaValues,
  );

  const i = all.findIndex((e) => e.folio === limpio.folio);
  if (i >= 0) {
    const detalle = camposModificados(all[i].values, limpio);
    all[i] = { ...all[i], values: limpio, actualizadoEn: ahora, actualizadoPor: quien };
    writeTable(TABLE, all);
    registrarEvento(user, 'Edición de Expediente', { folio: limpio.folio, paciente: limpio.nombreCompleto, detalle });
    return all[i];
  }

  const folio = siguienteFolio();
  const exp: Expediente = {
    folio,
    values: { ...limpio, folio, fechaEstudios: limpio.fechaEstudios || todayIso() },
    creadoEn: ahora,
    creadoPor: quien,
    actualizadoEn: ahora,
    actualizadoPor: quien,
  };
  writeTable(TABLE, [...all, exp]);
  registrarEvento(user, 'Creación de Folio', {
    folio,
    paciente: exp.values.nombreCompleto,
    detalle: `Nueva historia clínica${exp.values.tipoExamenMotivo ? ` · ${exp.values.tipoExamenMotivo}` : ''}`,
  });
  return exp;
}
