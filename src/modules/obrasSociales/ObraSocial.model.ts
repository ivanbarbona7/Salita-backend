import { model, Schema } from 'mongoose';

export interface IObraSocial {
    nombre: string;
    activo: boolean;
    // "NINGUNA": la crea el sistema, es la que traen los pacientes por defecto y no se puede modificar ni desactivar
    esSistema: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const obraSocialSchema = new Schema<IObraSocial>(
    {
        nombre: {
            type: String,
            required: [true, 'El nombre de la obra social es obligatorio'],
            trim: true,
            uppercase: true,
            minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
            maxlength: [60, 'El nombre no puede superar los 60 caracteres'],
            unique: true,
        },
        activo: { type: Boolean, default: true },
        esSistema: { type: Boolean, default: false },
    },
    { timestamps: true },
);

export default model<IObraSocial>('ObraSocial', obraSocialSchema);