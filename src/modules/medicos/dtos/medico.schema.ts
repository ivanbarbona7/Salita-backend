import { z } from 'zod';
import { TipoTelefono } from '../types/MedicoTelefono.enum';
import { franjaMedicoSchema, haySuperposicion } from '../../../utils/franja.schema';

export const queryMedicosSchema = z.object ({
    query: z.object({
        especialidad: z.string().optional(),
        dni: z.string().optional(),
        consultorio: z.string().optional(),
        activo: z.enum(['true', 'false']).optional()
    })
});

const aDia = (fecha: Date) => fecha.toISOString().slice(0, 10);
// Hoy en Argentina (UTC-3) como AAAA-MM-DD
const hoyAR = () => aDia(new Date(Date.now() - 3 * 60 * 60 * 1000));
// Un día de calendario que existe de verdad (rechaza 2026-02-31)
const esDiaReal = (dia: string) => {
    const fecha = new Date(`${dia}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && aDia(fecha) === dia;
};
const EDAD_MINIMA = 18;
// Día más reciente en que se puede haber nacido para tener hoy ya 18 años cumplidos
const nacimientoMasReciente = () => {
    const hoy = hoyAR();
    return `${Number(hoy.slice(0, 4)) - EDAD_MINIMA}${hoy.slice(4)}`;
};

// Fecha de nacimiento del médico: tiene que existir, ser de alguien mayor de edad y de no más de 100 años atrás
export const fechaNacimientoMedicoSchema = z
    .string({ error: 'Elegí la fecha de nacimiento' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida')
    .refine(esDiaReal, 'La fecha de nacimiento no es válida')
    .refine((dia) => dia <= nacimientoMasReciente(), `El médico tiene que ser mayor de ${EDAD_MINIMA} años`)
    .refine((dia) => Number(dia.slice(0, 4)) >= Number(hoyAR().slice(0, 4)) - 100, 'La fecha de nacimiento es demasiado antigua');

// Datos propios del médico (sin cuenta de acceso ni estado)
const datosMedico = z.object({
    nombre: z.string().min(2, "el nombre es obligatorio"),
    apellido: z.string().min(2, "el apellido es obligatorio"),
    dni: z.string().regex(/^\d{7,8}$/, "DNI invalido"),
    fechaNacimiento: fechaNacimientoMedicoSchema,
    especialidad: z.string({ error: "El ID de la especialidad es obligatorio"}).min(1, "La especialidad es obligatoria"),
    // NUEVO: matrícula obligatoria (el modelo además la exige única)
    matricula: z.string().trim().min(5, "La matrícula es obligatoria"),
    telefono: z.object({
        tipo: z.enum(TipoTelefono).optional().default(TipoTelefono.CELULAR),
        codigoArea: z.string(),
        numero: z.string()
    }),
    email: z.email('Email invalido'),
});

// NUEVO: lista de IDs de consultorio. Puede quedar vacía al crear (sin consultorio no recibe turnos).
const idConsultorio = z.string().length(24, "El ID del consultorio no es válido");

export const crearMedicoSchema = z.object({
    body: datosMedico.extend({
        consultorios: z.array(idConsultorio).default([]),
        consultorioHabitual: idConsultorio.optional(),
        activo: z.boolean().optional().default(true),
        acceso: z.object({
           user: z.string().min(3),
           password: z.string().min(8),
        }).optional(),
    })
});

// NUEVO: edición. Todo es opcional (lo que no llega no se toca). En "acceso" el usuario y la contraseña
// se pueden cambiar por separado. El controlador solo acepta estos campos (lista blanca).
export const actualizarMedicoSchema = z.object({
    body: datosMedico.partial().extend({
        consultorios: z.array(idConsultorio).optional(),
        // null = quitar el consultorio habitual
        consultorioHabitual: idConsultorio.nullable().optional(),
        activo: z.boolean().optional(),
        acceso: z.object({
            user: z.string().min(3).optional(),
            password: z.string().min(8).optional(),
        }).optional(),
    })
});

// ---------- Horario de atención ----------

// Cada franja dice en qué consultorio atiende el médico. Se superponen entre sí si caen
// en el mismo día y horario (aunque sean de consultorios distintos: no puede estar en dos lugares a la vez).
// Dos médicos distintos SÍ pueden coincidir en el mismo consultorio.
export const actualizarHorarioSchema = z.object({
    body: z.object({
        duracionTurno: z.number().int().min(5).max(120),
        franjas: z.array(franjaMedicoSchema).max(28),
    }).refine((h) => !haySuperposicion(h.franjas), {
        message: 'Hay horarios que se superponen en un mismo día',
        path: ['franjas'],
    }),
});

// ---------- Mi perfil (el médico edita sus propios datos) ----------
// Solo el teléfono y su contraseña: nombre, DNI, matrícula, especialidad, email y usuario los cambia el admin.
export const actualizarPerfilMedicoSchema = z.object({
    body: z.object({
        telefono: z.object({
            tipo: z.enum(TipoTelefono).optional(),
            codigoArea: z.string().regex(/^\d{2,5}$/, 'Código de área: de 2 a 5 números'),
            numero: z.string().regex(/^\d{6,8}$/, 'Número: de 6 a 8 números'),
        }),
    }),
});

export const cambiarPasswordMedicoSchema = z.object({
    body: z.object({
        passwordActual: z.string().min(1, 'Escribí tu contraseña actual'),
        passwordNueva: z.string().min(8, 'La contraseña nueva debe tener al menos 8 caracteres'),
    }),
});

export type ICrearMedicoDTO = z.infer<typeof crearMedicoSchema>['body'];
export type IActualizarMedicoDTO = z.infer<typeof actualizarMedicoSchema>['body'];
export type IQueryMedicos = z.infer<typeof queryMedicosSchema>['query'];
export type IActualizarPerfilMedicoDTO = z.infer<typeof actualizarPerfilMedicoSchema>['body'];
export type ICambiarPasswordMedicoDTO = z.infer<typeof cambiarPasswordMedicoSchema>['body'];
export type IActualizarHorarioDTO = z.infer<typeof actualizarHorarioSchema>['body'];