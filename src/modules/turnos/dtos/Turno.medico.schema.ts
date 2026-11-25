import { z } from 'zod';

// Agenda del médico: un día (AAAA-MM-DD). Sin fecha, es hoy.
export const queryTurnosMedicoSchema = z.object({
    query: z.object({
        fecha: z.iso.date({ message: 'La fecha debe tener el formato AAAA-MM-DD' }).optional(),
    }),
});

export type IQueryTurnosMedico = z.infer<typeof queryTurnosMedicoSchema>['query'];