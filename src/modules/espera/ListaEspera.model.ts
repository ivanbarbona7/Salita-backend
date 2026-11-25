import { model, Schema, Types } from 'mongoose';

export enum EstadoEspera {
    ACTIVA = 'ACTIVA',       // esperando que se libere un turno
    CUBIERTA = 'CUBIERTA',   // se le dio un turno
    CANCELADA = 'CANCELADA', // la sacó recepción (ya no lo necesita, consiguió otro, etc.)
}

export interface IListaEspera {
    paciente: Types.ObjectId;
    medico: Types.ObjectId;
    especialidad: Types.ObjectId;
    nota?: string;
    estado: EstadoEspera;
    turno?: Types.ObjectId; // el turno que se le dio al cubrirla
    createdAt: Date;
    updatedAt: Date;
}

const esperaSchema = new Schema<IListaEspera>(
    {
        paciente: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true, index: true },
        medico: { type: Schema.Types.ObjectId, ref: 'Medico', required: true, index: true },
        especialidad: { type: Schema.Types.ObjectId, ref: 'Especialidad', required: true },
        nota: { type: String, trim: true, maxlength: [200, 'La nota no puede superar los 200 caracteres'] },
        estado: { type: String, enum: Object.values(EstadoEspera), default: EstadoEspera.ACTIVA, index: true },
        turno: { type: Schema.Types.ObjectId, ref: 'Turno' },
    },
    { timestamps: true },
);

// Un paciente no puede estar dos veces (activo) en la espera del mismo médico.
// Protege de dos altas simultáneas; si ya fue cubierta o cancelada, puede anotarse de nuevo.
esperaSchema.index(
    { paciente: 1, medico: 1 },
    { unique: true, partialFilterExpression: { estado: EstadoEspera.ACTIVA } },
);

export default model<IListaEspera>('ListaEspera', esperaSchema);