import { z } from 'zod';
import { TipoTelefono } from '../types/PacienteTelefono.enum.js';

// Lo que el propio paciente puede editar de su ficha: teléfono, dirección y obra social.
// Nombre, apellido, DNI y email los corrige recepción o administración
// (el email es con el que ingresa a su cuenta).
export const actualizarPerfilPacienteSchema = z.object({
    body: z.object({
        telefono: z.object({
            tipo: z.enum(TipoTelefono).optional().default(TipoTelefono.CELULAR),
            codigoArea: z.string().regex(/^\d{2,5}$/, 'Código de área: de 2 a 5 números'),
            numero: z.string().regex(/^\d{6,10}$/, 'Número: de 6 a 10 números'),
        }),
        direccion: z.object({
            calle: z.string().trim().min(1, 'La calle es obligatoria'),
            numero: z.string().trim().min(1, 'El número es obligatorio'),
            piso: z.string().trim().optional().default(''),
            departamento: z.string().trim().optional().default(''),
            barrio: z.string().trim().optional().default(''),
        }),
        // El nombre tiene que estar en el catálogo de obras sociales (se comprueba en el controlador)
        obraSocial: z.object({
            nombre: z.string().trim().toUpperCase().min(1, 'Elegí una obra social'),
            numeroAfiliado: z.string().trim().optional().default(''),
        }),
    }),
});

export const cambiarPasswordPacienteSchema = z.object({
    body: z.object({
        passwordActual: z.string().min(1, 'Escribí tu contraseña actual'),
        passwordNueva: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    }),
});

export type IActualizarPerfilPacienteDTO = z.infer<typeof actualizarPerfilPacienteSchema>['body'];
export type ICambiarPasswordPacienteDTO = z.infer<typeof cambiarPasswordPacienteSchema>['body'];