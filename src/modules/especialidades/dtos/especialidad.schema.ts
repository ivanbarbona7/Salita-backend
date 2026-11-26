import { z } from 'zod';
import { CATEGORIAS_ESPECIALIDAD } from '../types/especialidad.categoria.js';

export const crearEspecialidadSchema = z.object({
    body: z.object({
        nombre: z.string().trim().min(2).max(100).toUpperCase(),
        descripcion: z.string().trim().min(3).max(200),
        categoria: z.enum(CATEGORIAS_ESPECIALIDAD, { error: 'La categoría no es válida' }),
        activo: z.boolean().default(true),
    }),
});

export const queryEspecialidadesSchema = z.object({
    query: z.object({
        nombre: z.string().optional(),
        // En la URL todo llega como texto ("true"), no como boolean
        activo: z.enum(['true', 'false']).optional(),
    }),
});

export type ICrearEspecialidadDTO = z.infer<typeof crearEspecialidadSchema>['body'];
export type IQueryEspecialidades = z.infer<typeof queryEspecialidadesSchema>['query'];