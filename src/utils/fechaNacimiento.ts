import { z } from 'zod';
import { hoyAR } from './rangoFechas';

const aDia = (fecha: Date) => fecha.toISOString().slice(0, 10);

// Un día de calendario que existe de verdad (rechaza 2026-02-31)
const esDiaReal = (dia: string) => {
    const fecha = new Date(`${dia}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && aDia(fecha) === dia;
};

// Un día "AAAA-MM-DD" que existe y no es futuro (ej.: fecha de ingreso)
export const diaNoFuturoSchema = z
    .string({ error: 'La fecha no es válida' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida')
    .refine(esDiaReal, 'La fecha no es válida')
    .refine((dia) => dia <= hoyAR(), 'La fecha no puede ser futura');

// Fecha de nacimiento de una persona de entre edadMinima y edadMaxima años (ya cumplidos)
export const diaNacimientoSchema = (edadMinima: number, edadMaxima: number) =>
    z
        .string({ error: 'Elegí la fecha de nacimiento' })
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida')
        .refine(esDiaReal, 'La fecha de nacimiento no es válida')
        .refine((dia) => {
            const hoy = hoyAR();
            return dia <= `${Number(hoy.slice(0, 4)) - edadMinima}${hoy.slice(4)}`;
        }, `Tiene que ser mayor de ${edadMinima} años`)
        .refine((dia) => {
            const hoy = hoyAR();
            return Number(dia.slice(0, 4)) >= Number(hoy.slice(0, 4)) - edadMaxima;
        }, 'La fecha de nacimiento es demasiado antigua');