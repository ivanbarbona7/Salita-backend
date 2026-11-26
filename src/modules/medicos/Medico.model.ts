import { model, Schema, Types, Document } from 'mongoose';
import type { IMedico } from './types/Medico.interface.js';
import { TipoTelefono } from './types/MedicoTelefono.enum.js';
import { rangoFechasMongoose } from '../../utils/rangoFechas.js';

// "HH:mm" en formato de 24 horas
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// NUEVO: una franja de atención (ej.: lunes de 08:00 a 12:00)
// diaSemana usa la numeración de Date.getDay(): 0 = domingo ... 6 = sábado
const franjaSchema = new Schema({
    diaSemana: { type: Number, required: true, min: 0, max: 6 },
    desde: { type: String, required: true, match: [HORA, 'La hora de inicio no es válida'] },
    hasta: { type: String, required: true, match: [HORA, 'La hora de fin no es válida'] },
    // NUEVO: consultorio donde atiende en esa franja
    consultorio: { type: Schema.Types.ObjectId, ref: 'Consultorio', required: [true, 'El consultorio de cada horario es obligatorio'] },
}, { _id: false });

const medicoSchema = new Schema<IMedico>({
    nombre: {
        type: String,
        required: [true, 'El nombre del médico es obligatorio'],
        uppercase: true,
    },
    apellido: {
        type: String,
        required: [true, 'El apellido del médico es obligatorio'],
        uppercase: true,
    },
    dni: {
        type: String,
        required: [true, 'El DNI del médico es obligatorio'],
        unique: [true, 'El DNI del médico debe ser único'],
        match: [/^[0-9]{7,8}$/, 'El DNI debe tener 8 dígitos']
    },
    // Día de nacimiento como "AAAA-MM-DD" (texto, sin hora). La edad se calcula al mostrarla.
    // No es "required" a nivel modelo porque los médicos cargados antes de este dato no la tienen;
    // el alta la exige en el schema (y que sea mayor de edad).
    fechaNacimiento: {
        type: String,
        match: [/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida'],
    },
    // NUEVO: matrícula profesional, obligatoria y única.
    // sparse: los médicos cargados antes de este campo no tienen matrícula y no cuentan para la unicidad.
    matricula: {
        type: String,
        trim: true,
        required: [true, 'La matrícula del médico es obligatoria'],
        unique: true,
        sparse: true,
    },
    especialidad: {
        type: Types.ObjectId,
        ref: 'Especialidad',
        required: [true, 'La especialidad del médico es obligatoria'],
    },
    // NUEVO: consultorios donde atiende. Un médico puede atender en varios y un consultorio tiene varios médicos.
    // La relación se guarda SOLO acá: el consultorio arma su lista de médicos a partir de este campo.
    consultorios: {
        type: [{ type: Schema.Types.ObjectId, ref: 'Consultorio' }],
        default: [],
    },
    // NUEVO: consultorio fijo del médico. Es opcional (se puede completar después de crearlo),
    // tiene que ser uno de sus consultorios y es el que viene por defecto al cargar sus horarios.
    consultorioHabitual: {
        type: Schema.Types.ObjectId,
        ref: 'Consultorio',
    },
    telefono: {
        tipo: {
            type: String,
            enum: Object.values(TipoTelefono),
        },
        codigoArea: {
            type: String,
            required: true,
            match: [/^[0-9]{2,5}$/, 'El código de área no es válido'],
        },
        numero: {
            type: String,
            required: true,
            match: [/^[0-9]{6,8}$/, 'El número de teléfono no es válido'],
        },
    },
    email: {
        type: String,
        required: [true, 'El correo electrónico del médico es obligatorio'],
        unique: [true, 'El correo electrónico del médico debe ser único'],
        match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'El correo electrónico no es válido']
    },
    // NUEVO: horario de atención semanal del médico
    horarioAtencion: {
        duracionTurno: {
            type: Number,
            default: 20,
            min: [5, 'La duración mínima del turno es de 5 minutos'],
            max: [120, 'La duración máxima del turno es de 120 minutos'],
        },
        franjas: { type: [franjaSchema], default: [] },
    },
    // NUEVO: fechas en las que no atiende (vacaciones, viajes, un día suelto)
    ausencias: { type: [rangoFechasMongoose], default: [] },
    activo: {
        type: Boolean,
        default: true,
        select: false
    }
}, {
    timestamps: true
});

medicoSchema.set('toJSON', {
    transform: (documento: Document, medicoRetorno: Record<string, any>) => {
        medicoRetorno.id = medicoRetorno._id;
        delete medicoRetorno._id;
        delete medicoRetorno.__v;
    }
});

const MedicoModel = model<IMedico>('Medico', medicoSchema);
export default MedicoModel;