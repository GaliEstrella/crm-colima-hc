import { readTable } from '@/lib/local-db';

/**
 * Médicos que firman los reportes oficiales (tomados de los formatos PECO y TX).
 * En producción mover a la base de datos / panel de administración.
 */
export interface MedicoFirmante {
  nombre: string;
  cedula: string;
  universidad: string;
  siglasUniversidad: string;
  direccion?: string;
  especialidad?: string;
}

export const MEDICOS_DICTAMINADORES: readonly MedicoFirmante[] = [
  {
    nombre: 'MANUEL ALEJANDRO CORIA SALAS',
    cedula: '14021036',
    universidad: 'UNIVERSIDAD DE COLIMA',
    siglasUniversidad: 'UDEC',
    direccion: 'ALDAMA 117, COL. CENTRO, COLIMA, COL.',
  },
];

/** Firma la hoja de Exámenes Visuales en ambas plantillas. */
export const OFTALMOLOGO: MedicoFirmante = {
  nombre: 'JOAQUÍN LOZANO GUASCH',
  cedula: '6204130',
  universidad: 'UNIVERSIDAD DE MONTERREY',
  siglasUniversidad: 'UDEM',
  especialidad: 'Médico especialista en oftalmología',
};

/** Usuario registrado tal como se guarda (solo los campos que interesan aquí). */
interface UsuarioGuardado {
  nombre: string;
  cedula: string;
  universidad: string;
  activo: boolean;
}

/**
 * Médicos que pueden atender: usuarios ACTIVOS con nombre, cédula y universidad
 * capturados (dados de alta por Leo), más los firmantes oficiales.
 * Lee el almacenamiento local (MOCK); en producción, GET /api/medicos.
 */
export function listarMedicos(): MedicoFirmante[] {
  const registrados = readTable<UsuarioGuardado[]>('usuarios', [])
    .filter((u) => u.activo && u.nombre?.trim() && u.cedula?.trim() && u.universidad?.trim())
    .map<MedicoFirmante>((u) => ({
      nombre: u.nombre.trim(),
      cedula: u.cedula.trim(),
      universidad: u.universidad.trim(),
      siglasUniversidad: u.universidad.trim(),
    }));
  const vistos = new Set<string>();
  return [...MEDICOS_DICTAMINADORES, ...registrados].filter((m) => {
    const k = m.nombre.toUpperCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/** Texto visible en la lista de "Médico que atiende". */
export const etiquetaMedico = (m: MedicoFirmante) => `${m.nombre} - Cédula: ${m.cedula} (${m.universidad})`;

/** Datos completos (cédula, universidad) del médico guardado en el expediente, para firmar el PDF. */
export const findMedico = (nombre: string | undefined) =>
  listarMedicos().find((m) => m.nombre.toUpperCase() === (nombre ?? '').trim().toUpperCase());
