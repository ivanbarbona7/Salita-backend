import { z } from 'zod';

const idMongo = (mensaje: string) => z.string({ error: mensaje }).length(24, mensaje);

export const queryMedicosPacienteSchema = z.object({
    query: z.object({ especialidad: idMongo('La especialidad es obligatoria') }),
});

export const queryDiasPacienteSchema = z.object({
    query: z.object({ medico: idMongo('El médico es obligatorio') }),
});

export const queryHorariosPacienteSchema = z.object({
    query: z.object({
        medico: idMongo('El médico es obligatorio'),
        fecha: z.iso.date({ message: 'La fecha debe tener el formato AAAA-MM-DD' }),
    }),
});

export type IQueryMedicosPaciente = z.infer<typeof queryMedicosPacienteSchema>['query'];
export type IQueryDiasPaciente = z.infer<typeof queryDiasPacienteSchema>['query'];
export type IQueryHorariosPaciente = z.infer<typeof queryHorariosPacienteSchema>['query'];