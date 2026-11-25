import { z } from 'zod';

// Franja horaria semanal, compartida por consultorios y médicos.
// diaSemana usa la numeración de Date.getDay(): 0 = domingo ... 6 = sábado.
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const franjaBase = z.object({
    diaSemana: z.number().int().min(0).max(6),
    desde: z.string().regex(HORA, 'Hora de inicio inválida'),
    hasta: z.string().regex(HORA, 'Hora de fin inválida'),
});

// "HH:mm" se puede comparar como texto
const finPosteriorAlInicio = (f: { desde: string; hasta: string }) => f.desde < f.hasta;
const mensajeFin = { message: 'La hora de fin debe ser posterior a la de inicio', path: ['hasta'] };

// Franja de un consultorio
export const franjaSchema = franjaBase.refine(finPosteriorAlInicio, mensajeFin);

// Franja de un médico: además dice en qué consultorio atiende
export const franjaMedicoSchema = franjaBase
    .extend({ consultorio: z.string().length(24, 'El ID del consultorio no es válido') })
    .refine(finPosteriorAlInicio, mensajeFin);

export type Franja = z.infer<typeof franjaSchema>;
export type FranjaMedico = z.infer<typeof franjaMedicoSchema>;

// Dos franjas del mismo día se superponen si cada una empieza antes de que termine la otra.
// Que una termine justo cuando empieza la otra (12:00 y 12:00) está permitido.
export const haySuperposicion = (franjas: Franja[]) =>
    franjas.some((a, i) =>
        franjas.some((b, j) => j > i && a.diaSemana === b.diaSemana && a.desde < b.hasta && b.desde < a.hasta),
    );