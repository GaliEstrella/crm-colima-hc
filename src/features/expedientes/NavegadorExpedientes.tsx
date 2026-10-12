'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronRight, ClipboardList, FolderOpen, Loader2, Search, X } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { StatCard } from '@/components/ui/StatCard';
import { card, inputPill, pillTab } from '@/components/ui/styles';
import { todayIso } from '@/lib/local-db';
import { listExpedientes, type Expediente } from '@/features/historia-clinica/api';
import { formatFechaMx, normalize } from '@/features/historia-clinica/lib/format';

const PAGE_SIZE = 12;

/** "09/10 14:05": lo justo para ubicar la última edición sin ensanchar la tabla. */
const fechaHoraCorta = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Tipos de examen (campo 7) con su etiqueta corta para pestañas y métricas. */
const TIPOS = [
  { valor: 'INGRESO / EVALUACIÓN INICIAL', corto: 'Ingreso' },
  { valor: 'RENOVACIÓN ANUAL', corto: 'Renovación' },
  { valor: 'CONTROL PERIÓDICO / SEGUIMIENTO', corto: 'Control' },
] as const;

const MOTIVO_TONE: Record<string, BadgeTone> = {
  'INGRESO / EVALUACIÓN INICIAL': 'blue',
  'RENOVACIÓN ANUAL': 'green',
  'CONTROL PERIÓDICO / SEGUIMIENTO': 'amber',
};

/** Histórico de registros: búsqueda rápida, filtros y acceso a cada expediente para consultar o editar. */
export function NavegadorExpedientes() {
  const router = useRouter();
  const [data, setData] = useState<Expediente[] | null>(null);
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tipo, setTipo] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    listExpedientes().then(setData);
  }, []);

  const filtrados = useMemo(() => {
    if (!data) return [];
    const nq = normalize(q);
    return data.filter(({ folio, values: v }) => {
      if (nq && ![v.nombreCompleto, v.curp, folio, v.empresa].some((s) => normalize(s ?? '').includes(nq))) return false;
      if (desde && v.fechaEstudios < desde) return false;
      if (hasta && v.fechaEstudios > hasta) return false;
      if (tipo && v.tipoExamenMotivo !== tipo) return false;
      return true;
    });
  }, [data, q, desde, hasta, tipo]);

  // Volver a la primera página cuando cambian los filtros
  useEffect(() => setPage(0), [q, desde, hasta, tipo]);

  const visibles = filtrados.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hayFiltros = !!(q || desde || hasta || tipo);

  const hoy = todayIso();
  const kpis = useMemo(() => {
    const d = data ?? [];
    const haceUnaSemana = Date.now() - 7 * 24 * 3600 * 1000;
    const porTipo = Object.fromEntries(TIPOS.map((t) => [t.valor, d.filter((e) => e.values.tipoExamenMotivo === t.valor).length]));
    return {
      total: d.length,
      semana: d.filter((e) => new Date(e.creadoEn).getTime() >= haceUnaSemana).length,
      hoy: d.filter((e) => e.values.fechaEstudios === hoy).length,
      editadosHoy: d.filter((e) => e.values.fechaEstudios !== hoy && todayIso(new Date(e.actualizadoEn)) === hoy).length,
      porTipo,
    };
  }, [data, hoy]);

  return (
    <div className="w-full animate-enter px-4 pb-16 pt-6 sm:px-6">
      <PageHeader
        title="Navegador de expedientes"
        description="Consulta o edita cualquier historia clínica capturada. Cada apertura queda registrada en la bitácora."
      />

      {/* Resumen de métricas */}
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={FolderOpen}
          label="Expedientes registrados"
          value={data ? kpis.total : '—'}
          detail={data && kpis.semana > 0 ? `+${kpis.semana} en 7 días` : undefined}
        />
        <StatCard icon={ClipboardList} label="Tipos de examen" tone="blue">
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {TIPOS.map((t) => (
              <div key={t.valor} className="min-w-0">
                <dd className="text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 md:text-[28px]">
                  {data ? kpis.porTipo[t.valor] : '—'}
                </dd>
                <dt className="truncate text-xs text-slate-500">{t.corto}</dt>
              </div>
            ))}
          </dl>
        </StatCard>
        <StatCard
          icon={CalendarCheck}
          label="Atenciones de hoy"
          tone="green"
          value={data ? kpis.hoy : '—'}
          detail={data && kpis.editadosHoy > 0 ? `${kpis.editadosHoy} editados hoy` : undefined}
        />
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="space-y-4 p-6 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Historial de expedientes</h2>
            {/* Tipo de examen como pestañas en cápsula */}
            <div role="tablist" aria-label="Tipo de examen" className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-well p-1">
              {[{ valor: '', corto: 'Todos' }, ...TIPOS].map((t) => (
                <button
                  key={t.valor || 'todos'}
                  type="button"
                  role="tab"
                  aria-selected={tipo === t.valor}
                  onClick={() => setTipo(t.valor)}
                  className={`${pillTab(tipo === t.valor)} shrink-0 !px-4 !py-2`}
                >
                  {t.corto}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto]">
            <label className="relative md:col-span-2 lg:col-span-1">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, CURP, folio o empresa"
                className={`${inputPill} pl-10`}
              />
            </label>
            <FiltroFecha label="Desde" value={desde} onChange={setDesde} max={hasta || undefined} />
            <FiltroFecha label="Hasta" value={hasta} onChange={setHasta} min={desde || undefined} />
            <button
              type="button"
              onClick={() => {
                setQ('');
                setDesde('');
                setHasta('');
                setTipo('');
              }}
              disabled={!hayFiltros}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-full px-4 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-40"
            >
              <X className="h-4 w-4" /> Limpiar
            </button>
          </div>
        </div>

        {!data ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-ink-subtle" />
          </div>
        ) : filtrados.length === 0 ? (
          <Vacio hayRegistros={data.length > 0} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-well text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3">Folio</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Paciente</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Tipo de examen</th>
                    <th className="px-4 py-3">Última edición</th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(({ folio, values: v, actualizadoEn, actualizadoPor }) => (
                    <tr
                      key={folio}
                      onClick={() => router.push(`/expediente/${folio}`)}
                      className="group cursor-pointer border-b border-slate-100 transition-colors duration-150 last:border-0 hover:bg-crm-red-soft/30"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-ink">{folio}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">{formatFechaMx(v.fechaEstudios, '/')}</td>
                      <td className="max-w-72 px-4 py-3">
                        <Link
                          href={`/expediente/${folio}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate font-medium text-ink outline-none group-hover:text-crm-red-dark focus-visible:underline"
                        >
                          {v.nombreCompleto || 'Sin nombre'}
                        </Link>
                        <span className="block truncate font-mono text-[11px] text-ink-subtle">{v.curp || 'Sin CURP'}</span>
                      </td>
                      <td className="max-w-48 truncate px-4 py-3 text-ink-muted">{v.empresa || '—'}</td>
                      <td className="px-4 py-3">
                        {v.tipoExamenMotivo ? (
                          <Badge tone={MOTIVO_TONE[v.tipoExamenMotivo] ?? 'neutral'}>{v.tipoExamenMotivo}</Badge>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-muted">
                        <span className="block tabular-nums">
                          {fechaHoraCorta(actualizadoEn)}
                        </span>
                        <span className="block max-w-44 truncate text-ink-subtle">{actualizadoPor.nombre}</span>
                      </td>
                      <td className="px-4 py-3 text-ink-subtle">
                        <ChevronRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-crm-red" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtrados.length} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

function FiltroFecha({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <label className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-subtle">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputPill} pl-16 tabular-nums`}
      />
    </label>
  );
}

function Vacio({ hayRegistros }: { hayRegistros: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-600">
        <FolderOpen className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-semibold text-ink">{hayRegistros ? 'Sin coincidencias' : 'Aún no hay expedientes'}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">
        {hayRegistros
          ? 'Prueba con otro término o ajusta los filtros de fecha y tipo de examen.'
          : 'Las historias clínicas que guardes aparecerán aquí.'}
      </p>
    </div>
  );
}
