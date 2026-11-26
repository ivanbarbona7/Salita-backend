import { z } from 'zod';
import { Rol, TurnoLaboral } from '../../auth/Usuario.model.js';
import { diaNacimientoSchema, diaNoFuturoSchema } from '../../../utils/fechaNacimiento.js';

const nombrePropio = (mensaje: string) => z.string().trim().min(2, mensaje).max(40, 'Máximo 40 caracteres');

// Datos de la persona (los comunes a crear y a editar)
const datosPersonal = z.object({
    nombre: nombrePropio('El nombre es obligatorio'),
    apellido: nombrePropio('El apellido es obligatorio'),
    dni: z.string().regex(/^\d{7,8}$/, 'DNI inválido: 7 u 8 números, sin puntos'),
    // Mayor de edad y de no más de 100 años
    fechaNacimiento: diaNacimientoSchema(18, 100),
    telefono: z.object({
        codigoArea: z.string().regex(/^\d{2,5}$/, 'Código de área: de 2 a 5 números, sin 0'),
        numero: z.string().regex(/^\d{6,10}$/, 'Número: de 6 a 10 números, sin espacios ni guiones'),
    }),
    email: z.email('Email inválido'),
});

const rolPersonal = z.enum({ ADMIN: Rol.ADMIN, RECEPCIONISTA: Rol.RECEPCIONISTA }, { error: 'Elegí un rol válido' });

export const crearPersonalSchema = z.object({
    body: datosPersonal.extend({
        user: z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres'),
        password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
        rol: rolPersonal,
        turno: z.enum(TurnoLaboral).optional(),
        fechaIngreso: diaNoFuturoSchema.optional(),
    }),
});

// Edición (solo ADMIN). Lo que no llega no se toca; null en turno o fechaIngreso = borrar el dato.
// El rol no se cambia desde acá. La contraseña, si llega, es un reinicio hecho por el administrador.
export const actualizarPersonalSchema = z.object({
    body: datosPersonal.partial().extend({
        user: z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres').optional(),
        password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').optional(),
        turno: z.enum(TurnoLaboral).nullable().optional(),
        fechaIngreso: diaNoFuturoSchema.nullable().optional(),
    }),
});

export const queryPersonalSchema = z.object({
    query: z.object({
        q: z.string().trim().max(100).optional(),
        // 'true' = mostrar el personal desactivado en lugar del activo
        inactivos: z.enum(['true', 'false']).optional(),
    }),
});

export type ICrearPersonalDTO = z.infer<typeof crearPersonalSchema>['body'];
export type IActualizarPersonalDTO = z.infer<typeof actualizarPersonalSchema>['body'];
export type IQueryPersonal = z.infer<typeof queryPersonalSchema>['query'];