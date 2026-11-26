import { Types, Document } from "mongoose";
import { EstadoTurno } from "./TurnoEstado.enum.js";

// CAMBIO: se quitaron los campos repetidos (medicoId, fecha, especialidadId) y se agregó el consultorio.
export interface ITurno extends Document {
    paciente: Types.ObjectId;
    consultorio: Types.ObjectId;
    especialidad: Types.ObjectId;
    medico: Types.ObjectId;
    fechaTurno: Date; // inicio del turno
    fechaFin: Date;   // fin del turno (inicio + duración del turno del médico)
    estado: EstadoTurno;
    observaciones?: string;
    reprogramaciones?: number; // cuántas veces se cambió la fecha del turno
    fechaOriginal?: Date;      // fecha del turno antes de la primera reprogramación
    activo?: boolean;
}