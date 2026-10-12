import { delay, newId, readTable, writeTable } from '@/lib/local-db';
import type { Role, SessionUser } from '@/features/auth/types';
import { generarPasswordTemporal, problemaPassword } from './password';
import { validarDatosUsuario } from './validacion';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  role: Role;
  cedula: string;
  universidad: string;
  activo: boolean;
  creadoEn: string;
  /** null = cuenta inicial del sistema (Leo) */
  creadoPor: string | null;
  salt: string;
  passwordHash: string;
  /** Asignada por Administración y aún no cambiada por el usuario. */
  passwordTemporal?: boolean;
  /** ISO del último inicio de sesión correcto. */
  ultimoAcceso?: string;
}

export type UsuarioPublico = Omit<Usuario, 'salt' | 'passwordHash'>;

export interface NuevoUsuario {
  nombre: string;
  email: string;
  password: string;
  cedula?: string;
  universidad?: string;
}

const TABLE = 'usuarios';

/** Se emite en `window` cada vez que cambia la lista de usuarios (alta, edición de perfil, activar/desactivar). */
export const USUARIOS_CAMBIARON = 'crm-hc:usuarios-cambiaron';

function guardar(users: Usuario[]) {
  writeTable(TABLE, users);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USUARIOS_CAMBIARON));
}

/**
 * Cuenta de administración inicial (solo desarrollo). Cambiar la contraseña
 * en cuanto exista backend: aquí queda escrita en el código fuente.
 */
export const LEO_SEED = { email: 'leo@crm-colima.mx', password: 'Leo#Colima2026' } as const;

async function hash(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const normEmail = (e: string) => e.trim().toLowerCase();
const publico = ({ salt: _s, passwordHash: _h, ...u }: Usuario): UsuarioPublico => u;

async function load(): Promise<Usuario[]> {
  const users = readTable<Usuario[]>(TABLE, []);
  if (users.some((u) => u.role === 'Leo')) return users;
  const salt = newId();
  const leo: Usuario = {
    id: newId(),
    nombre: 'Leo',
    email: LEO_SEED.email,
    role: 'Leo',
    cedula: '',
    universidad: '',
    activo: true,
    creadoEn: new Date().toISOString(),
    creadoPor: null,
    salt,
    passwordHash: await hash(LEO_SEED.password, salt),
    // Está escrita en el código fuente: se pide cambiarla en el primer acceso
    passwordTemporal: true,
  };
  const seeded = [leo, ...users];
  guardar(seeded);
  return seeded;
}

function validar(nuevo: NuevoUsuario, role: Role, users: Usuario[]) {
  validarDatosUsuario({ nombre: nuevo.nombre, email: nuevo.email, role, cedula: nuevo.cedula ?? '', universidad: nuevo.universidad ?? '' });
  const problema = problemaPassword(nuevo.password);
  if (problema) throw new Error(problema);
  if (users.some((u) => u.email === normEmail(nuevo.email))) throw new Error('Ya existe una cuenta con ese correo.');
}

async function crear(nuevo: NuevoUsuario, role: Role, creadoPor: string | null): Promise<UsuarioPublico> {
  const users = await load();
  validar(nuevo, role, users);
  const salt = newId();
  const u: Usuario = {
    id: newId(),
    nombre: nuevo.nombre.trim().toUpperCase(),
    email: normEmail(nuevo.email),
    role,
    cedula: (nuevo.cedula ?? '').trim(),
    universidad: (nuevo.universidad ?? '').trim().toUpperCase(),
    activo: true,
    creadoEn: new Date().toISOString(),
    creadoPor,
    salt,
    passwordHash: await hash(nuevo.password, salt),
    // Toda alta hecha por Administración nace con contraseña temporal
    passwordTemporal: creadoPor !== null,
  };
  guardar([...users, u]);
  return publico(u);
}

/** Alta directa desde el panel de Leo, con el rol que él elija. */
export async function crearUsuario(nuevo: NuevoUsuario, role: Role, admin: SessionUser): Promise<UsuarioPublico> {
  if (admin.role !== 'Leo') throw new Error('Solo Administración puede dar de alta usuarios.');
  await delay(300);
  return crear(nuevo, role, admin.id);
}

export async function listUsuarios(): Promise<UsuarioPublico[]> {
  await delay(150);
  return (await load()).map(publico);
}

export async function setUsuarioActivo(id: string, activo: boolean, admin: SessionUser): Promise<void> {
  if (admin.role !== 'Leo') throw new Error('Solo Administración puede cambiar el estado de un usuario.');
  const users = await load();
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error('El usuario ya no existe.');
  await actualizarUsuario(admin, id, { ...u, activo });
}

export interface CambiosUsuario {
  nombre: string;
  email: string;
  role: Role;
  cedula: string;
  universidad: string;
  activo: boolean;
}

/**
 * Edición de cualquier cuenta por Administración. Salvaguardas para no quedarse
 * sin acceso: nadie se desactiva ni se quita el rol de Administrador a sí mismo,
 * y siempre debe quedar al menos un Administrador activo.
 */
export async function actualizarUsuario(admin: SessionUser, id: string, c: CambiosUsuario): Promise<UsuarioPublico> {
  if (admin.role !== 'Leo') throw new Error('Solo Administración puede editar usuarios.');
  await delay(300);
  const users = await load();
  const i = users.findIndex((u) => u.id === id);
  if (i < 0) throw new Error('El usuario ya no existe.');
  validarDatosUsuario(c);
  const email = normEmail(c.email);
  if (users.some((u, j) => j !== i && u.email === email)) throw new Error('Ese correo ya lo usa otra cuenta.');
  if (id === admin.id && !c.activo) throw new Error('No puedes desactivar tu propia cuenta.');
  if (id === admin.id && c.role !== 'Leo') throw new Error('No puedes quitarte el rol de Administrador a ti mismo.');
  const actualizado: Usuario = {
    ...users[i],
    nombre: c.nombre.trim().toUpperCase(),
    email,
    role: c.role,
    cedula: c.cedula.trim(),
    universidad: c.universidad.trim().toUpperCase(),
    activo: c.activo,
  };
  const resultado = users.map((u, j) => (j === i ? actualizado : u));
  if (!resultado.some((u) => u.role === 'Leo' && u.activo)) throw new Error('Debe quedar al menos un Administrador activo.');
  guardar(resultado);
  return publico(actualizado);
}

/**
 * Reemplaza la contraseña por una temporal nueva y la devuelve (única vez que se ve).
 * La anterior deja de funcionar y el usuario deberá cambiarla al entrar.
 */
export async function restablecerPassword(admin: SessionUser, id: string): Promise<string> {
  if (admin.role !== 'Leo') throw new Error('Solo Administración puede restablecer contraseñas.');
  await delay(300);
  const users = await load();
  const i = users.findIndex((u) => u.id === id);
  if (i < 0) throw new Error('El usuario ya no existe.');
  const password = generarPasswordTemporal();
  const salt = newId();
  users[i] = { ...users[i], salt, passwordHash: await hash(password, salt), passwordTemporal: true };
  guardar(users);
  return password;
}

/**
 * MOCK de inicio de sesión. En producción: POST /api/auth/login, que valida en el
 * servidor y responde con el rol real del usuario en una cookie httpOnly.
 */
export async function authenticate(email: string, password: string, perfil?: Role): Promise<SessionUser> {
  await delay(450);
  if (!email.trim() || !password) throw new Error('Ingresa tu correo y contraseña.');
  const users = await load();
  const u = users.find((x) => x.email === normEmail(email));
  if (!u || (await hash(password, u.salt)) !== u.passwordHash) throw new Error('Correo o contraseña incorrectos.');
  if (!u.activo) throw new Error('Tu cuenta está inactiva. Contacta a Administración.');
  if (perfil && perfil !== u.role) {
    throw new Error(
      perfil === 'Leo'
        ? 'Esta cuenta no tiene acceso de Administración. Ingresa como Servicios Médicos.'
        : 'Esta es una cuenta de Administración. Ingresa como Administración.',
    );
  }
  guardar(users.map((x) => (x.id === u.id ? { ...x, ultimoAcceso: new Date().toISOString() } : x)));
  return aSesion(u);
}

const aSesion = (u: Usuario): SessionUser => ({
  id: u.id,
  email: u.email,
  nombre: u.nombre,
  role: u.role,
  cedula: u.cedula || undefined,
  universidad: u.universidad || undefined,
  passwordTemporal: u.passwordTemporal || undefined,
});

async function buscarPropio(user: SessionUser): Promise<[Usuario[], number]> {
  const users = await load();
  const i = users.findIndex((u) => u.id === user.id);
  if (i < 0 || !users[i].activo) throw new Error('Tu cuenta ya no está disponible. Vuelve a iniciar sesión.');
  return [users, i];
}

export interface DatosPerfil {
  nombre: string;
  email: string;
  cedula: string;
  universidad: string;
}

/** Datos actuales del usuario en sesión (pueden haber cambiado desde que inició sesión). */
export async function obtenerPerfil(user: SessionUser): Promise<DatosPerfil> {
  const [users, i] = await buscarPropio(user);
  const { nombre, email, cedula, universidad } = users[i];
  return { nombre, email, cedula, universidad };
}

/**
 * El usuario en sesión actualiza sus propios datos. Solo puede tocar su cuenta:
 * el id sale de la sesión, nunca del formulario. Devuelve la sesión actualizada.
 */
export async function actualizarPerfil(user: SessionUser, datos: DatosPerfil): Promise<SessionUser> {
  await delay(350);
  const [users, i] = await buscarPropio(user);
  // El rol sale de la cuenta guardada, nunca del formulario de perfil
  validarDatosUsuario({ ...datos, role: users[i].role });
  const email = normEmail(datos.email);
  if (users.some((u, j) => j !== i && u.email === email)) throw new Error('Ese correo ya lo usa otra cuenta.');
  users[i] = {
    ...users[i],
    nombre: datos.nombre.trim().toUpperCase(),
    email,
    cedula: datos.cedula.trim(),
    universidad: datos.universidad.trim().toUpperCase(),
  };
  guardar(users);
  return aSesion(users[i]);
}

/** Cambio de contraseña con verificación de la actual. Quita la marca de temporal. */
export async function cambiarPassword(user: SessionUser, actual: string, nueva: string): Promise<SessionUser> {
  await delay(450);
  const [users, i] = await buscarPropio(user);
  if ((await hash(actual, users[i].salt)) !== users[i].passwordHash) throw new Error('La contraseña actual no es correcta.');
  const problema = problemaPassword(nueva);
  if (problema) throw new Error(problema);
  if (nueva === actual) throw new Error('La nueva contraseña debe ser distinta de la actual.');
  const salt = newId();
  users[i] = { ...users[i], salt, passwordHash: await hash(nueva, salt), passwordTemporal: false };
  guardar(users);
  return aSesion(users[i]);
}
