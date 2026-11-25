import { z } from 'zod';

// Letras (con tildes y ñ), números, espacios y . , ' & ( ) / -   Se pasa a mayúsculas y se juntan los espacios.
const nombre = z
    .string({ error: 'El nombre es obligatorio' })
    .transform((v) => v.trim().replace(/\s+/g, ' ').toUpperCase())
    .pipe(
        z
            .string()
            .min(2, 'El nombre debe tener al menos 2 caracteres')
            .max(60, 'El nombre no puede superar los 60 caracteres')
            .regex(/^[\p{L}\d][\p{L}\d .,'&()/-]*$/u, 'El nombre tiene caracteres no permitidos'),
    );

export const crearObraSocialSchema = z.object({ body: z.object({ nombre }) });
export const renombrarObraSocialSchema = z.object({ body: z.object({ nombre }) });

export const queryObrasSocialesSchema = z.object({
    query: z.object({ activas: z.enum(['true', 'false']).optional() }),
});

export type CrearObraSocialDTO = z.infer<typeof crearObraSocialSchema>['body'];
export type QueryObrasSocialesDTO = z.infer<typeof queryObrasSocialesSchema>['query'];