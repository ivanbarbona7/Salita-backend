import type { Request, Response } from 'express';
import Turno from './Turno.model';
import { EstadoTurno } from './types/TurnoEstado.enum';
import { claveDia } from './turnos.service';
import type { IQueryTurnosMedico } from './dtos/Turno.medico.schema';
import { respuestaEstandar } from '../../utils/respuestaEstandar';

// Pantallas del MÉDICO. El médico siempre sale del token: solo ve y modifica sus propios turnos.

const DIA_MS = 24 * 60 * 60 * 1000;

const mensajeDeError = (error: unknown) =>
    error instanceof Error ? error.message : 'Error interno del servidor';

// Turnos de un día (?fecha=AAAA-MM-DD, por defecto hoy), en orden de hora
const getMisTurnosMedico = async (req: Request<unknown, unknown, unknown, IQueryTurnosMedico>, res: Response) => {
    try {
        const medicoId = req.usuario?.medicoId;
        if (!medicoId) return respuestaEstandar(res, 403, false, 'Tu cuenta no está vinculada a un médico');

        const dia = req.query.fecha ?? claveDia(new Date());
        const inicio = new Date(`${dia}T00:00:00-03:00`);

        const turnos = await Turno.find({
            medico: medicoId,
            activo: { $ne: false },
            fechaTurno: { $gte: inicio, $lt: new Date(inicio.getTime() + DIA_MS) },
        })
            .populate('paciente', 'nombre apellido dni telefono obraSocial')
            .populate('consultorio', 'nombre')
            .sort({ fechaTurno: 1 });

        return respuestaEstandar(res, 200, true, 'Turnos obtenidos exitosamente', turnos);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// Marcar como atendido, solo si el turno es suyo
const marcarAtendidoMedico = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const medicoId = req.usuario?.medicoId;
        if (!medicoId) return respuestaEstandar(res, 403, false, 'Tu cuenta no está vinculada a un médico');

        const turno = await Turno.findOneAndUpdate(
            { _id: req.params.id, medico: medicoId, activo: { $ne: false }, estado: EstadoTurno.PENDIENTE },
            { estado: EstadoTurno.ATENDIDO },
            { new: true },
        );
        if (!turno) return respuestaEstandar(res, 409, false, 'Solo se puede marcar como atendido un turno tuyo que esté pendiente');

        return respuestaEstandar(res, 200, true, 'Turno marcado como atendido', turno);
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'No se pudo actualizar el turno', mensajeDeError(error));
    }
};

export { getMisTurnosMedico, marcarAtendidoMedico };