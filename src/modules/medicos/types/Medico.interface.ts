import { Document, Types} from 'mongoose';
import { TipoTelefono } from './MedicoTelefono.enum';
import type { IRango } from '../../../utils/rangoFechas';


export interface ITelefono {
    tipo?: TipoTelefono;
    codigoArea: string;
    numero: string;
}
export interface IMedico extends Document {
    nombre: string;
    apellido: string;
    dni: string;
    fechaNacimiento?: string; // AAAA-MM-DD
    especialidad: Types.ObjectId;
    // NUEVO: consultorios donde atiende (puede estar vacío al crear al médico)
    consultorios: Types.ObjectId[];
    // NUEVO: consultorio fijo del médico (uno de los de arriba). Puede completarse después de crearlo.
    consultorioHabitual?: Types.ObjectId;
    telefono: ITelefono;
    email: string;
    matricula: string;
    activo?: boolean;
    // Fechas en las que no atiende (vacaciones, viajes, un día suelto). Los turnos no se ofrecen en esas fechas.
    ausencias?: IRango[];
    horarioAtencion?: {
    duracionTurno: number;
    // Cada franja dice en qué consultorio atiende (uno de los del médico)
    franjas: { diaSemana: number; desde: string; hasta: string; consultorio: Types.ObjectId }[];
    };
}