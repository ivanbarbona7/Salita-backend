import { z } from 'zod';

const idMongo = (mensaje: string) => z.string({ error: mensaje }).length(24, mensaje);

export const crearEsperaSchema = z.object({
    body: z.object({
        paciente: idMongo('El paciente es obligatorio'),
        medico: idMongo('El médico es obligatorio'),
        nota: z.string().trim().max(200, 'La nota no puede superar los 200 caracteres').optional(),
    }),
});

// Se da un turno en un horario que se liberó: viajan el consultorio y el inicio exacto del horario
export const asignarEsperaSchema = z.object({
    body: z.object({
        consultorio: idMongo('El consultorio es obligatorio'),
        fechaTurno: z.iso.datetime({ message: 'La fecha y hora no son válidas' }),
    }),
});

export const queryEsperaSchema = z.object({
    query: z.object({
        estado: z.enum(['ACTIVA', 'CUBIERTA', 'CANCELADA']).optional(),
    }),
});

export type CrearEsperaDTO = z.infer<typeof crearEsperaSchema>['body'];
export type AsignarEsperaDTO = z.infer<typeof asignarEsperaSchema>['body'];
export type QueryEsperaDTO = z.infer<typeof queryEsperaSchema>['query'];