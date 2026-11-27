import { z } from 'zod';

const idMongo = (mensaje: string) => z.string({ error: mensaje }).length(24, mensaje);

// CAMBIO: antes pedía solo paciente, especialidad y una fecha sin hora, y no incluía al médico.
// Ahora el turno lleva toda la cadena: consultorio, especialidad, médico y el horario elegido.
const datosTurno = z.object({
    consultorio: idMongo('El consultorio es obligatorio'),
    especialidad: idMongo('La especialidad es obligatoria'),
    medico: idMongo('El médico es obligatorio'),
    // Es el "inicio" de uno de los horarios libres que devuelve /turnos/disponibilidad
    fechaTurno: z.iso.datetime({ message: 'La fecha y hora no son válidas' }),
    observaciones: z.string().max(500, 'Las observaciones no pueden superar los 500 caracteres').optional().default(''),
});

export const CrearTurnoSchema = z.object({
    body: datosTurno.extend({
        paciente: idMongo('El paciente es obligatorio'),
    })
});

export const queryUrgenciaSchema = z.object({
    query: z.object({
        urgencia: z.enum(['true', 'false']).optional()
    })
});

// NUEVO: horarios libres de un médico, en un consultorio, un día
export const queryDisponibilidadSchema = z.object({
    query: z.object({
        medico: idMongo('El médico es obligatorio'),
        consultorio: idMongo('El consultorio es obligatorio'),
        fecha: z.iso.date({ message: 'La fecha debe tener el formato AAAA-MM-DD' }),
    })
});

// "Nuevo turno": horarios libres de un médico un día, en todos sus consultorios
export const queryHorariosMedicoSchema = z.object({
    query: z.object({
        medico: idMongo('El médico es obligatorio'),
        fecha: z.iso.date({ message: 'La fecha debe tener el formato AAAA-MM-DD' }),
    })
});

// Listado del dashboard de recepción: filtros y paginación en el servidor
export const queryListadoTurnosSchema = z.object({
    query: z.object({
        id: z.string().length(24).optional(), // un solo turno (lo usa el detalle)
        fecha: z.iso.date({ message: 'La fecha debe tener el formato AAAA-MM-DD' }).optional(),
        q: z.string().trim().max(60).optional(),        // paciente: nombre, apellido o DNI
        medico: z.string().trim().max(60).optional(),   // médico: nombre o apellido
        consultorio: z.string().length(24).optional(),
        estado: z.enum(['pendiente', 'atendido', 'no_asistio']).optional(),
        sort: z.enum(['fecha', 'paciente']).optional(),
        order: z.enum(['asc', 'desc']).optional(),
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
    }),
});

// Cancelación masiva: hasta 100 turnos por vez
export const cancelarTurnosSchema = z.object({
    body: z.object({
        ids: z.array(idMongo('Id de turno inválido')).min(1, 'Elegí al menos un turno').max(100, 'Podés cancelar hasta 100 turnos por vez'),
    }),
});

// Reprogramar: solo viaja la nueva fecha (es el "inicio" de uno de los horarios libres)
export const reprogramarTurnoSchema = z.object({
    body: z.object({ fechaTurno: z.iso.datetime({ message: 'La fecha y hora no son válidas' }) }),
});
export type IReprogramarTurnoDTO = z.infer<typeof reprogramarTurnoSchema>['body']

// El paciente sale del token, nunca del body
export const turnoPacienteSchema = datosTurno;

export type CrearTurnoDTO = z.infer<typeof CrearTurnoSchema>['body']
export type IQueryUrgencia = z.infer<typeof queryUrgenciaSchema>['query']
export type IQueryDisponibilidad = z.infer<typeof queryDisponibilidadSchema>['query']
export type ITurnoPaciente = z.infer<typeof turnoPacienteSchema>
export type IQueryListadoTurnos = z.infer<typeof queryListadoTurnosSchema>['query'];
export type IQueryHorariosMedico = z.infer<typeof queryHorariosMedicoSchema>['query'];