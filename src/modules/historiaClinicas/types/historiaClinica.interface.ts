import type { Document, Types } from 'mongoose';

export type ActividadFisica = 'Ninguna' | 'Baja' | 'Moderada' | 'Alta';
export const ACTIVIDADES_FISICAS: ActividadFisica[] = ['Ninguna', 'Baja', 'Moderada', 'Alta'];

// Lo que casi no cambia: se actualiza cuando hace falta
export interface IAntecedentes {
    alergias: string[];
    enfermedadesCronicas: string[];
    medicamentosHabituales: string[];
    cirugiasPrevias: string[];
    internacionesPrevias: string[];
    antecedentesFamiliares: string[];
    vacunas: string[];
    habitos: {
        tabaquismo: boolean;
        alcohol: boolean;
        actividadFisica: ActividadFisica;
    };
    otros: string;
}

// Una anotación de la historia. Solo se agregan: no se editan ni se borran
// (un error se corrige con una anotación nueva).
export interface IConsulta {
    _id: Types.ObjectId;
    fecha: Date;
    medico: Types.ObjectId;
    turno?: Types.ObjectId;
    motivoConsulta: string;
    sintomas: string[];
    diagnostico: string;
    tratamiento: string;
    observaciones: string;
    createdAt: Date;
}

// Una historia por paciente
export interface IHistoriaClinica extends Document {
    paciente: Types.ObjectId;
    antecedentes: IAntecedentes;
    consultas: Types.DocumentArray<IConsulta>;
    activo: boolean;
}