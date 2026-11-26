import { model, Schema, Document } from "mongoose";
import type { IPaciente } from './types/Paciente.interface.js';
import { TipoTelefono } from './types/PacienteTelefono.enum.js';

const pacienteSchema = new Schema<IPaciente>({
    nombre: {
        type: String,
        required: [true, 'El nombre del paciente es obligatorio'],
        uppercase: true,
    },
    apellido: {
        type: String,
        uppercase: true,
    },
    dni: {
        type: String,
        required: [true, 'El DNI del paciente es obligatorio'],
        unique: [true, 'El DNI del paciente debe ser único'],
        match: [/^[0-9]{7,8}$/, 'El DNI debe tener 7 u 8 dígitos'],
    },
    // Día de nacimiento como "AAAA-MM-DD" (texto, sin hora: así no hay corrimientos por zona horaria).
    // La edad no se guarda: se calcula al mostrarla, porque cambia sola con los años.
    fechaNacimiento: {
        type: String,
        match: [/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida'],
    },
    direccion: {
        calle: String,
        numero: String,
        piso: String,
        departamento: String,
        barrio: String,
    },
    email: {
        type: String,
        match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'El correo electrónico no es válido'],
    },
    telefono: {
        tipo: {
            type: String,
            enum: Object.values(TipoTelefono),
        },
        codigoArea: {
            type: String,
            match: [/^[0-9]{2,5}$/, 'El código de área no es válido'],
        },
        numero: {
            type: String,
            required: [true, 'El número de teléfono es obligatorio'],
            // Con código de área de 4 dígitos (ej. 3777) el número local tiene 6: {7,10} lo rechazaba
            match: [/^[0-9]{6,10}$/, 'El número de teléfono no es válido'],
        },
    },
    // El nombre tiene que existir en el catálogo de obras sociales (se valida al guardar, en el controlador).
    // Por defecto "NINGUNA".
    obraSocial: {
        nombre: {
            type: String,
            trim: true,
            uppercase: true,
            default: 'NINGUNA',
        },
        numeroAfiliado: String,
    },
    historialMedico: {
        type: Schema.Types.ObjectId,
        ref: 'historiaClinicas',
    },
    activo: {
        type: Boolean,
        default: true,
    },
    origen: {
        type: String,
        enum: ['RECEPCION', 'INGRESO_RAPIDO'],
        default: 'RECEPCION',
    },
}, {
    timestamps: true,
});

pacienteSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

pacienteSchema.set('toJSON', {
    transform: (documento: Document, pacienteRetorno: Record<string, any>) => {
        pacienteRetorno.id = pacienteRetorno._id;
        delete pacienteRetorno._id;
        delete pacienteRetorno.__v;
    }
});

const PacienteModel = model<IPaciente>('Paciente', pacienteSchema);

export default PacienteModel;