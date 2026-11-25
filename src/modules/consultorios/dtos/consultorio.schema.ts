import { z } from 'zod';
import { TipoTelefono } from '../types/ConsultorioTelefono.enum';
import { franjaSchema, haySuperposicion } from '../../../utils/franja.schema';

export const direccionSchema = z.object({
    calle: z.string(),
    numero: z.string(),
    piso: z.string().optional().default(""),
    departamento: z.string().optional().default(""),
    barrio: z.string().optional().default("")
});

export const queryConsultoriosSchema = z.object({
    query: z.object({
        especialidad: z.string().optional(),
        profesionalResponsable: z.string().optional(),
        ciudad: z.string().optional(),
        activo: z.enum(['true', 'false']).optional()
    })
});

const idMongo = (mensaje: string) => z.string({ error: mensaje }).length(24, mensaje);

// Datos del consultorio (sin el estado)
const datosConsultorio = z.object({
    nombre: z.string().trim().min(2, "El nombre es obligatorio"),
    // CAMBIO: antes "especialidad" (una sola). Ahora una lista de IDs.
    especialidades: z.array(idMongo("El ID de la especialidad no es válido")).default([]),
    todasLasEspecialidades: z.boolean().optional().default(false),
    profesionalResponsable: idMongo("El ID del profesional responsable no es válido"),
    direccion: direccionSchema,
    ciudad: z.string().trim().min(2, "La ciudad es obligatoria"),
    telefono: z.object({
        tipo: z.enum(TipoTelefono).optional().default(TipoTelefono.CELULAR),
        codigoArea: z.string().regex(/^[0-9]{2,5}$/, "El código de área no es válido"),
        numero: z.string().regex(/^[0-9]{6,8}$/, "El número de teléfono no es válido")
    }),
    correoElectronico: z.email("Email inválido"),
    // NUEVO: horario semanal con varias franjas por día
    horarioAtencion: z.object({
        franjas: z.array(franjaSchema).min(1, "Cargá al menos un horario de atención").max(28),
    }).refine((h) => !haySuperposicion(h.franjas), {
        message: "Hay horarios que se superponen en un mismo día",
        path: ['franjas'],
    }),
});

export const crearConsultorioSchema = z.object({
    body: datosConsultorio
        .extend({
            activo: z.boolean().optional().default(true),
        })
        .refine((d) => d.todasLasEspecialidades || d.especialidades.length > 0, {
            message: 'Elegí al menos una especialidad o marcá "Atiende todas las especialidades"',
            path: ['especialidades'],
        }),
});

// NUEVO: edición. Todo es opcional (lo que no llega no se toca).
export const actualizarConsultorioSchema = z.object({
    body: datosConsultorio.partial().extend({
        activo: z.boolean().optional(),
    })
});

export type ICrearConsultorioDTO = z.infer<typeof crearConsultorioSchema>['body'];
export type IActualizarConsultorioDTO = z.infer<typeof actualizarConsultorioSchema>['body'];
export type IQueryConsultorios = z.infer<typeof queryConsultoriosSchema>['query'];