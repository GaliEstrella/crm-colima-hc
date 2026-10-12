'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import type { HistoriaClinicaValues } from '@/features/historia-clinica/config/fields';
import { buscarPorIdentificador, CAMPOS_FIJOS, type PacienteDemografico } from './api';

type Fijos = Pick<HistoriaClinicaValues, (typeof CAMPOS_FIJOS)[number]>;

export interface Precarga {
  paciente: PacienteDemografico;
  /** Valores que había antes de precargar, para poder deshacer. */
  anteriores: Fijos;
}

const DEBOUNCE_MS = 300;

/**
 * Detecta pacientes recurrentes: cuando el CURP (18 caracteres) o el NSS
 * (11 dígitos) capturados coinciden con un registro previo, copia los datos
 * fijos (nombre, nacimiento, género, domicilio, teléfono, empresa y puesto)
 * para que el médico solo capture los datos clínicos de la nueva visita.
 * La edad y el grupo de edad se recalculan solos a partir de la fecha de nacimiento.
 *
 * Se verifica al dejar de escribir (debounce) y al salir del campo (`verificar`, para onBlur).
 * Solo actúa en historias nuevas (`enabled`) y una vez por paciente.
 */
export function usePacienteRecurrente(form: UseFormReturn<HistoriaClinicaValues>, enabled: boolean) {
  const { control, getValues, setValue } = form;
  const [curp, nss] = useWatch({ control, name: ['curp', 'nss'] });
  const [precarga, setPrecarga] = useState<Precarga | null>(null);
  const aplicado = useRef<string | null>(null);

  const aplicar = useCallback(
    (p: PacienteDemografico) => {
      const anteriores = Object.fromEntries(CAMPOS_FIJOS.map((k) => [k, getValues(k)])) as Fijos;
      for (const k of CAMPOS_FIJOS) setValue(k, p[k] ?? '', { shouldDirty: true });
      aplicado.current = p.id;
      setPrecarga({ paciente: p, anteriores });
    },
    [getValues, setValue],
  );

  const verificar = useCallback(async () => {
    if (!enabled) return;
    const p = await buscarPorIdentificador({ curp: getValues('curp'), nss: getValues('nss') }, getValues('folio'));
    if (p && p.id !== aplicado.current) aplicar(p);
  }, [enabled, getValues, aplicar]);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(verificar, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [curp, nss, enabled, verificar]);

  const deshacer = useCallback(() => {
    if (!precarga) return;
    for (const k of CAMPOS_FIJOS) setValue(k, precarga.anteriores[k], { shouldDirty: true });
    setPrecarga(null);
    // Se conserva `aplicado` para no volver a precargar al mismo paciente en automático.
  }, [precarga, setValue]);

  /** Para "Nueva": olvida al paciente anterior. */
  const limpiar = useCallback(() => {
    aplicado.current = null;
    setPrecarga(null);
  }, []);

  /** Cierra el aviso sin deshacer la precarga. */
  const descartarAviso = useCallback(() => setPrecarga(null), []);

  return { precarga, aplicar, verificar, deshacer, limpiar, descartarAviso };
}
