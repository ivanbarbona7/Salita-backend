import { Schema } from 'mongoose';
import { z } from 'zod';

// Rangos de fechas ("AAAA-MM-DD", día argentino) para ausencias de médicos y cierres de consultorios.
// Se guardan como texto: así no hay problemas de zona horaria y se comparan como texto ("2026-12-02" < "2026-12-10").
export const MAX_DIAS_RANGO = 15;      // máximo de días seguidos por carga
export const MAX_DIAS_ADELANTE = 365;  // hasta cuántos días hacia adelante se puede cargar

const DIA_MS = 24 * 60 * 60 * 1000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface IRango {
    _id?: unknown;
    desde: string;
    hasta: string;
    motivo?: string;
}

// Sub-esquema de Mongoose, lo usan Medico (ausencias) y Consultorio (cierres)
export const rangoFechasMongoose = new Schema(
    {
        desde: { type: String, required: true, match: [FECHA, 'La fecha de inicio no es válida'] },
        hasta: { type: String, required: true, match: [FECHA, 'La fecha de fin no es válida'] },
        motivo: { type: String, trim: true, maxlength: [100, 'El motivo no puede superar los 100 caracteres'], default: '' },
    },
    {
        toJSON: {
            transform: (_doc: unknown, ret: Record<string, any>) => {
                ret.id = ret._id;
                delete ret._id;
            },
        },
    },
);

const aUTC = (dia: string) => Date.parse(`${dia}T00:00:00Z`);
export const diasDelRango = (r: { desde: string; hasta: string }) => Math.round((aUTC(r.hasta) - aUTC(r.desde)) / DIA_MS) + 1;
export const sumarDias = (dia: string, n: number) => new Date(aUTC(dia) + n * DIA_MS).toISOString().slice(0, 10);
// "Hoy" en hora argentina (UTC-3)
export const hoyAR = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const seSuperponen = (a: { desde: string; hasta: string }, b: { desde: string; hasta: string }) =>
    a.desde <= b.hasta && b.desde <= a.hasta;

export const rangoFechasSchema = z
    .object({
        desde: z.iso.date({ message: 'La fecha de inicio debe tener el formato AAAA-MM-DD' }),
        hasta: z.iso.date({ message: 'La fecha de fin debe tener el formato AAAA-MM-DD' }),
        motivo: z.string().trim().max(100, 'El motivo no puede superar los 100 caracteres').optional().default(''),
    })
    .refine((r) => r.desde <= r.hasta, { message: 'La fecha de fin no puede ser anterior a la de inicio', path: ['hasta'] })
    .refine((r) => diasDelRango(r) <= MAX_DIAS_RANGO, {
        message: `Podés cargar hasta ${MAX_DIAS_RANGO} días seguidos por vez`,
        path: ['hasta'],
    });

export const crearRangoSchema = z.object({ body: rangoFechasSchema });
export type IRangoDTO = z.infer<typeof rangoFechasSchema>;

// Controles que dependen de la fecha de hoy y de lo ya cargado. Devuelve el mensaje de error, o null si está bien.
export const errorDeRango = (nuevo: { desde: string; hasta: string }, existentes: { desde: string; hasta: string }[]): string | null => {
    if (nuevo.desde < hoyAR()) return 'No se pueden cargar fechas que ya pasaron';
    if (nuevo.hasta > sumarDias(hoyAR(), MAX_DIAS_ADELANTE)) {
        return `Solo se pueden cargar fechas de los próximos ${MAX_DIAS_ADELANTE} días`;
    }
    if (existentes.some((e) => seSuperponen(e, nuevo))) {
        return 'Ya hay fechas cargadas que se superponen con esas. Quitá la anterior primero';
    }
    return null;
};