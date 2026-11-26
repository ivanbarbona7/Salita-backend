import { z } from 'zod';
import { ACTIVIDADES_FISICAS } from '../types/historiaClinica.interface.js';

// Cada ítem de una lista se limpia y no puede quedar vacío. Los esquemas no transforman el tipo
// (entran y salen listas de texto), así que se pueden aplicar más de una vez sin problema.
const lista = z.array(z.string().trim().min(1).max(120)).max(30, 'Máximo 30 ítems').optional().default([]);

export const antecedentesSchema = z.object({
    alergias: lista,
    enfermedadesCronicas: lista,
    medicamentosHabituales: lista,
    cirugiasPrevias: lista,
    internacionesPrevias: lista,
    antecedentesFamiliares: lista,
    vacunas: lista,
    habitos: z
        .object({
            tabaquismo: z.boolean().optional().default(false),
            alcohol: z.boolean().optional().default(false),
            actividadFisica: z.enum(ACTIVIDADES_FISICAS).optional().default('Ninguna'),
        })
        .optional()
        .default({ tabaquismo: false, alcohol: false, actividadFisica: 'Ninguna' }),
    otros: z.string().trim().max(500, 'Máximo 500 caracteres').optional().default(''),
});

export const actualizarAntecedentesSchema = z.object({ body: antecedentesSchema });

export const crearConsultaSchema = z.object({
    body: z.object({
        motivoConsulta: z.string({ error: 'El motivo de consulta es obligatorio' }).trim().min(1, 'El motivo de consulta es obligatorio').max(500, 'Máximo 500 caracteres'),
        sintomas: lista,
        diagnostico: z.string({ error: 'El diagnóstico es obligatorio' }).trim().min(1, 'El diagnóstico es obligatorio').max(1000, 'Máximo 1000 caracteres'),
        tratamiento: z.string().trim().max(1000, 'Máximo 1000 caracteres').optional().default(''),
        observaciones: z.string().trim().max(500, 'Máximo 500 caracteres').optional().default(''),
        // Turno que se atiende con esta consulta (opcional): se marca como atendido
        turno: z.string().length(24, 'El turno no es válido').optional(),
    }),
});

export type IAntecedentesDTO = z.infer<typeof antecedentesSchema>;
export type IConsultaDTO = z.infer<typeof crearConsultaSchema>['body'];