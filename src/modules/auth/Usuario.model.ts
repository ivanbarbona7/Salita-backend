import { Schema, model, Document, Types } from 'mongoose';

export enum Rol {
    ADMIN = 'ADMIN',
    RECEPCIONISTA = 'RECEPCIONISTA',
    PACIENTE = 'PACIENTE',
    MEDICO = 'MEDICO'
}

// Turno en que trabaja el personal (administradores y recepcionistas)
export enum TurnoLaboral {
    MANANA = 'MAÑANA',
    TARDE = 'TARDE',
    NOCHE = 'NOCHE',
    ROTATIVO = 'ROTATIVO',
}

export interface IUsuario extends Document {
    nombre?: string;
    apellido?: string;
    email: string;
    user: string;
    password: string;
    rol: Rol;
    activo: boolean;
    paciente?: Types.ObjectId;
    medico?: Types.ObjectId;
    // Datos del personal (ADMIN y RECEPCIONISTA). Los pacientes y médicos los tienen en su propia ficha.
    dni?: string;
    fechaNacimiento?: string; // AAAA-MM-DD
    telefono?: { codigoArea: string; numero: string };
    fechaIngreso?: string;    // AAAA-MM-DD
    turno?: TurnoLaboral;
}

const usuarioSchema = new Schema<IUsuario>({
    nombre: { type: String, trim: true },
    apellido: { type: String, trim: true },
    email: { type: String, required: true, unique: true },
    user: { type: String, unique: true },
    password: { type: String, required: true },
    rol: { type: String, enum: Object.values(Rol), default: Rol.RECEPCIONISTA },
    activo: { type: Boolean, default: true },
    paciente: { type: Schema.Types.ObjectId, ref: 'Paciente' },
    medico: { type: Schema.Types.ObjectId, ref: 'Medico' },

    // No son "required" a nivel modelo: los usuarios cargados antes de estos datos no los tienen.
    // El alta de personal los exige en el schema de la API.
    dni: { type: String, match: [/^[0-9]{7,8}$/, 'El DNI debe tener 7 u 8 dígitos'] },
    fechaNacimiento: { type: String, match: [/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida'] },
    telefono: {
        codigoArea: { type: String, match: [/^[0-9]{2,5}$/, 'El código de área no es válido'] },
        numero: { type: String, match: [/^[0-9]{6,10}$/, 'El número de teléfono no es válido'] },
    },
    fechaIngreso: { type: String, match: [/^\d{4}-\d{2}-\d{2}$/, 'La fecha de ingreso no es válida'] },
    turno: { type: String, enum: Object.values(TurnoLaboral) },
}, { timestamps: true });

// El DNI es único entre quienes lo tienen (los pacientes y médicos con cuenta no lo guardan acá)
usuarioSchema.index({ dni: 1 }, { unique: true, partialFilterExpression: { dni: { $type: 'string' } } });

export default model<IUsuario>('Usuario', usuarioSchema);