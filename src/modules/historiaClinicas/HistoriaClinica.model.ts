import { model, Schema } from 'mongoose';
import { ACTIVIDADES_FISICAS, type IHistoriaClinica } from './types/historiaClinica.interface.js';

// Se devuelven "id" en lugar de "_id" y sin "__v", como el resto de los modelos
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aJson = (_doc: unknown, retorno: any) => {
    retorno.id = retorno._id;
    delete retorno._id;
    delete retorno.__v;
    return retorno;
};

const consultaSchema = new Schema(
    {
        fecha: { type: Date, required: true, default: Date.now },
        medico: { type: Schema.Types.ObjectId, ref: 'Medico', required: true },
        // Turno que se atendió con esta consulta (si se eligió alguno)
        turno: { type: Schema.Types.ObjectId, ref: 'Turno' },
        motivoConsulta: { type: String, required: [true, 'El motivo de consulta es obligatorio'], trim: true, maxlength: 500 },
        sintomas: { type: [String], default: [] },
        diagnostico: { type: String, required: [true, 'El diagnóstico es obligatorio'], trim: true, maxlength: 1000 },
        tratamiento: { type: String, default: '', trim: true, maxlength: 1000 },
        observaciones: { type: String, default: '', trim: true, maxlength: 500 },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);
consultaSchema.set('toJSON', { transform: aJson });

const historiaClinicaSchema = new Schema<IHistoriaClinica>(
    {
        // Una sola historia por paciente
        paciente: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true, unique: true },
        antecedentes: {
            alergias: { type: [String], default: [] },
            enfermedadesCronicas: { type: [String], default: [] },
            medicamentosHabituales: { type: [String], default: [] },
            cirugiasPrevias: { type: [String], default: [] },
            internacionesPrevias: { type: [String], default: [] },
            antecedentesFamiliares: { type: [String], default: [] },
            vacunas: { type: [String], default: [] },
            habitos: {
                tabaquismo: { type: Boolean, default: false },
                alcohol: { type: Boolean, default: false },
                actividadFisica: { type: String, enum: ACTIVIDADES_FISICAS, default: 'Ninguna' },
            },
            otros: { type: String, default: '', trim: true, maxlength: 500 },
        },
        consultas: { type: [consultaSchema], default: [] },
        activo: { type: Boolean, default: true, select: false },
    },
    { timestamps: true },
);
historiaClinicaSchema.set('toJSON', { transform: aJson });

export default model<IHistoriaClinica>('HistoriaClinica', historiaClinicaSchema);