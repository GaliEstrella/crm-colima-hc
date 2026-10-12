import { normalize } from '@/features/historia-clinica/lib/format';
import { readTable } from '@/lib/local-db';
import type { HistoriaClinicaValues } from '@/features/historia-clinica/config/fields';
import type { Expediente } from '@/features/historia-clinica/api';

/**
 * Datos fijos del paciente que se precargan en una nueva visita. La edad y el
 * grupo de edad no se copian: se recalculan desde la fecha de nacimiento.
 */
export const CAMPOS_FIJOS = [
  'nombreCompleto',
  'fechaNacimiento',
  'genero',
  'curp',
  'nss',
  'domicilioCalle',
  'domicilioColonia',
  'domicilioMunicipio',
  'domicilioEstado',
  'telefono',
  'empresa',
  'puesto',
] as const satisfies readonly (keyof HistoriaClinicaValues)[];

export type PacienteDemografico = Pick<HistoriaClinicaValues, (typeof CAMPOS_FIJOS)[number]> & {
  id: string;
  /** Folio de la visita más reciente de la que se tomaron los datos (vacío en demo). */
  ultimoFolio: string;
};

// ⚠️ Pacientes FICTICIOS para desarrollo. Reemplazar por GET /api/pacientes?q=
const MOCK: PacienteDemografico[] = [
  {
    id: 'p1',
    ultimoFolio: '',
    nombreCompleto: 'GARCÍA LÓPEZ JUAN CARLOS',
    fechaNacimiento: '1985-03-12',
    genero: 'MASCULINO',
    curp: 'GALJ850312HCMRPN09',
    nss: '12345678901',
    domicilioCalle: 'AV. EJEMPLO 123',
    domicilioColonia: 'COLIMA CENTRO',
    domicilioMunicipio: 'COLIMA',
    domicilioEstado: 'COLIMA',
    telefono: '3121234567',
    empresa: 'CONSORCIO MINERO DEMO',
    puesto: 'OPERADOR',
  },
  {
    id: 'p2',
    ultimoFolio: '',
    nombreCompleto: 'MARTÍNEZ RUIZ ANA SOFÍA',
    fechaNacimiento: '1992-07-04',
    genero: 'FEMENINO',
    curp: 'MARA920704MCMRZN05',
    nss: '98765432109',
    domicilioCalle: 'CALLE PRUEBA 45',
    domicilioColonia: 'VILLA DE ÁLVAREZ CENTRO',
    domicilioMunicipio: 'VILLA DE ÁLVAREZ',
    domicilioEstado: 'COLIMA',
    telefono: '3127654321',
    empresa: 'LOGÍSTICA PORTUARIA DEMO',
    puesto: 'SUPERVISORA',
  },
  {
    id: 'p3',
    ultimoFolio: '',
    nombreCompleto: 'HERNÁNDEZ SOTO LUIS ALBERTO',
    fechaNacimiento: '1970-01-21',
    genero: 'MASCULINO',
    curp: 'HESL700121HCMRTS02',
    nss: '45612378901',
    domicilioCalle: 'BLVD. DEMO 8',
    domicilioColonia: 'MANZANILLO CENTRO',
    domicilioMunicipio: 'MANZANILLO',
    domicilioEstado: 'COLIMA',
    telefono: '3141112233',
    empresa: 'CONSORCIO MINERO DEMO',
    puesto: 'MECÁNICO',
  },
];

const fromExpediente = (e: Expediente): PacienteDemografico => ({
  id: `exp-${e.folio}`,
  ultimoFolio: e.folio,
  ...(Object.fromEntries(CAMPOS_FIJOS.map((k) => [k, e.values[k] ?? ''])) as Pick<
    HistoriaClinicaValues,
    (typeof CAMPOS_FIJOS)[number]
  >),
});

/**
 * Un paciente por CURP (o NSS si no hay CURP), tomando su visita más reciente.
 * Los registros reales tienen prioridad sobre los de demostración.
 */
function pacientes(excluirFolio?: string): PacienteDemografico[] {
  const exps = readTable<Expediente[]>('expedientes', [])
    .filter((e) => e.folio !== excluirFolio && (e.values.curp || e.values.nss))
    .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
  const vistos = new Set<string>();
  const out: PacienteDemografico[] = [];
  for (const p of [...exps.map(fromExpediente), ...MOCK]) {
    const id = claveCurp(p.curp) || `nss:${claveNss(p.nss)}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push(p);
  }
  return out;
}

/** CURP comparable: mayúsculas, solo letras (incluye Ñ) y dígitos. */
export const claveCurp = (v: string | undefined) => (v ?? '').toUpperCase().replace(/[^A-Z0-9Ñ]/g, '');
/** NSS comparable: solo dígitos (tolera espacios y guiones: 1234-56-7890-1). */
export const claveNss = (v: string | undefined) => (v ?? '').replace(/\D/g, '');

/**
 * Coincidencia EXACTA por CURP (18 caracteres) o NSS (11 dígitos) completos, para el
 * precargado automático de pacientes recurrentes. No exige que el CURP tenga la
 * estructura oficial perfecta: basta con que sea idéntico al ya registrado.
 * `excluirFolio` evita que un expediente se encuentre a sí mismo.
 */
export async function buscarPorIdentificador(
  { curp, nss }: { curp?: string; nss?: string },
  excluirFolio?: string,
): Promise<PacienteDemografico | null> {
  const c = claveCurp(curp);
  const n = claveNss(nss);
  const porCurp = c.length === 18;
  const porNss = n.length === 11;
  if (!porCurp && !porNss) return null;
  return (
    pacientes(excluirFolio).find(
      (p) => (porCurp && claveCurp(p.curp) === c) || (porNss && claveNss(p.nss) === n),
    ) ?? null
  );
}

/** Busca por CURP, NSS (prefijo) o nombre completo (contiene, sin acentos). */
export async function searchPacientes(query: string): Promise<PacienteDemografico[]> {
  const q = normalize(query);
  if (q.length < 2) return [];
  await new Promise((r) => setTimeout(r, 150));
  return pacientes()
    .filter((p) => normalize(p.curp).startsWith(q) || p.nss.startsWith(q) || normalize(p.nombreCompleto).includes(q))
    .slice(0, 8);
}
