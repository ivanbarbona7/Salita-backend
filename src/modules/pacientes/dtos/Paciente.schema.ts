import { z } from 'zod';
import { TipoTelefono } from '../types/PacienteTelefono.enum.js';

export const direccionSchema = z.object({
    calle: z.string(),
    numero: z.string(),
    piso: z.string().optional().default(""),
    departamento: z.string().optional().default(""),
    barrio: z.string().optional().default("")
});

// CAMBIO: se agregan q, page, limit, sort y order para la lista paginada.
// Los query params llegan siempre como string, por eso page/limit son strings numéricos
// y el controlador los convierte con parseInt.
export const queryPacientesSchema = z.object({
    query: z.object({
        obraSocial: z.string().optional(),
        dni: z.string().optional(),
        q: z.string().trim().max(100).optional(),
        page: z.string().regex(/^\d+$/, 'page inválido').optional(),
        limit: z.string().regex(/^\d+$/, 'limit inválido').optional(),
        sort: z.enum(['apellido', 'nombre']).optional(),
        order: z.enum(['asc', 'desc']).optional(),
        // 'true' = mostrar los pacientes desactivados en lugar de los activos
        inactivos: z.enum(['true', 'false']).optional(),
    })
});

// Obra social: el nombre tiene que estar cargado en el catálogo (Configuración > Obras sociales).
// Eso se comprueba en el controlador; acá solo se limpia el texto.
export const obraSocialSchema = z.object({
    nombre: z.string().trim().toUpperCase().min(1, 'Elegí una obra social'),
    numeroAfiliado: z.string().optional().default(''),
});

const aDia = (fecha: Date) => fecha.toISOString().slice(0, 10);
// Hoy en Argentina (UTC-3) como AAAA-MM-DD
const hoyAR = () => aDia(new Date(Date.now() - 3 * 60 * 60 * 1000));
// Un día de calendario que existe de verdad (rechaza 2026-02-31)
const esDiaReal = (dia: string) => {
    const fecha = new Date(`${dia}T00:00:00Z`);
    return !Number.isNaN(fecha.getTime()) && aDia(fecha) === dia;
};

// Fecha de nacimiento: AAAA-MM-DD, que exista, que no sea futura y de no más de 120 años atrás
export const fechaNacimientoSchema = z
    .string({ error: 'Elegí la fecha de nacimiento' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida')
    .refine(esDiaReal, 'La fecha de nacimiento no es válida')
    .refine((dia) => dia <= hoyAR(), 'La fecha de nacimiento no puede ser futura')
    .refine((dia) => Number(dia.slice(0, 4)) >= Number(hoyAR().slice(0, 4)) - 120, 'La fecha de nacimiento es demasiado antigua');

// CAMBIO: el body se saca a una constante para reutilizarlo en crear y en actualizar.
const pacienteBody = z.object({
    nombre: z.string().min(2, "el nombre es obligatorio"),
    apellido: z.string().min(2, "el apellido es obligatorio"),
    dni: z.string().regex(/^\d{7,8}$/, 'DNI inválido'),
    fechaNacimiento: fechaNacimientoSchema,
    direccion: direccionSchema,
    email: z.email('Email invalido'),
    telefono: z.object({
        tipo: z.enum(TipoTelefono).optional().default(TipoTelefono.CELULAR),
        // Mismas reglas que el modelo de paciente: si no, el error llega recién al guardar, sin decir qué campo
        codigoArea: z.string().regex(/^\d{2,5}$/, 'Código de área: de 2 a 5 números, sin 0'),
        numero: z.string().regex(/^\d{6,10}$/, 'Número: de 6 a 10 números, sin espacios ni guiones'),
    }),
    obraSocial: obraSocialSchema,
    // CAMBIO: ahora es opcional. El formulario del front no lo envía (la historia clínica
    // se crea/vincula aparte); si lo dejás obligatorio, el alta desde el front da error 400.
    historialMedico: z.string({ error: "El ID es obligatorio" })
        .length(24, "El ID de la historia clínica no es válido")
        .optional(),
    activo: z.boolean().optional().default(true),
    // NUEVO: usuario de la cuenta de acceso. Si no se envía, se usa el DNI.
    user: z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres').optional(),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').optional(),
});

export const crearPacienteSchema = z.object({
    body: pacienteBody
});

// NUEVO: para PUT /pacientes/:id.
// Se omiten historialMedico y activo: no se editan desde este formulario.
// user y password sí llegan, pero el controlador solo los aplica si quien edita es ADMIN.
export const actualizarPacienteSchema = z.object({
    body: pacienteBody.omit({ historialMedico: true, activo: true }).partial()
});

// Nombre o apellido: se limpian los espacios y cada palabra queda con la primera letra en mayúscula.
// Se aceptan letras con tildes y ñ, apóstrofes y guiones ("O'Brien", "Pérez-Gómez").
const nombrePropio = (obligatorio: string, invalido: string) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(2, obligatorio)
        .max(40, 'Máximo 40 caracteres')
        .regex(/^\p{L}[\p{L}'’ -]*$/u, invalido),
    )
    .transform((v) => v.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toUpperCase()));

export const ingresoSchema = z.object({
  nombre: nombrePropio('Escribí tu nombre', 'El nombre solo puede tener letras'),
  apellido: nombrePropio('Escribí tu apellido', 'El apellido solo puede tener letras'),
  dni: z.string().regex(/^\d{7,8}$/, 'El DNI tiene 7 u 8 números, sin puntos'),
  telefono: z
    .string()
    .transform((v) => v.replace(/\D/g, '').replace(/^(0|549|54)/, ''))
    .pipe(z.string().regex(/^\d{10}$/, 'Escribí el código de área y el número (10 números en total). Ejemplo: 3794907810')),
});

export type ICrearPacienteDTO = z.infer<typeof crearPacienteSchema>['body'];
export type IActualizarPacienteDTO = z.infer<typeof actualizarPacienteSchema>['body'];
export type IQueryPacientes = z.infer<typeof queryPacientesSchema>['query'];