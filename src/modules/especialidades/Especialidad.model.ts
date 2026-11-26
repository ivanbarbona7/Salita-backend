
import { Schema, model, Document } from 'mongoose';
import type { IEspecialidad } from './types/especialidad.interface.js';
import { CATEGORIAS_ESPECIALIDAD } from './types/especialidad.categoria.js';

const especialidadSchema = new Schema<IEspecialidad>({
    nombre: {
        type: String,
        required: [true, 'El nombre de la especialidad es obligatorio'],
        unique: [true, 'El nombre de la especialidad debe ser único'],
        uppercase: true,
    },
    descripcion: {
        type: String,
        required: [true, 'La descripción de la especialidad es obligatoria']
    },
    activo: {
        type: Boolean,
        default: true,
        select: false
    },
    categoria: {
        type: String,
        enum: {
            values: CATEGORIAS_ESPECIALIDAD,
            message: '{VALUE} no es una categoría válida',
        },
        required: [true, 'La categoría de la especialidad es obligatoria'],
    },
}, {
    timestamps: true
});

especialidadSchema.set('toJSON', {
    transform: (documento: Document, especialidadRetorno: Record<string, any>) => {
        especialidadRetorno.id = especialidadRetorno._id;
        delete especialidadRetorno._id;
        delete especialidadRetorno.__v;
    }
});

const especialidadModel = model<IEspecialidad>('Especialidad', especialidadSchema);

export default especialidadModel;