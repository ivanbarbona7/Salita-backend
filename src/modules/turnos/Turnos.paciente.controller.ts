import type { Request, Response } from 'express';
import Medico from '../medicos/Medico.model';
import Consultorio from '../consultorios/Consultorio.model';
import Especialidad from '../especialidades/Especialidad.model';
import Turno from './Turno.model';
import { EstadoTurno } from './types/TurnoEstado.enum';
import {
    claveDia, diaLimitePaciente, disponibilidadPorMedico, horariosDeUnDia,
    diasLibresEnConsultorio, motivoNoReprogramarPaciente, reprogramarTurno, HORAS_PARA_CAMBIAR,
} from './turnos.service';
import type { IReprogramarTurnoDTO } from './dtos/turno.schema';
import type { IQueryDiasPaciente, IQueryHorariosPaciente, IQueryMedicosPaciente } from './dtos/Turnos.paciente.schema';
import { respuestaEstandar } from '../../utils/respuestaEstandar';

// Pantallas del PACIENTE (ingreso rápido o con cuenta). El paciente siempre sale del token.

const mensajeDeError = (error: unknown) =>
    error instanceof Error ? error.message : 'Error interno del servidor';

const HORA_MS = 60 * 60 * 1000;
const HORAS_PARA_CANCELAR = HORAS_PARA_CAMBIAR;

// 11000 = clave duplicada: otro turno tomó ese horario justo antes (índice único del modelo)
const esClaveDuplicada = (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

// Médicos activos que tienen algún horario cargado en "Horario de atención"
const CON_HORARIO = { activo: { $ne: false }, 'horarioAtencion.franjas.0': { $exists: true } };

// Paso 1: solo las especialidades que tienen al menos un médico con horario cargado
const getEspecialidadesPaciente = async (_req: Request, res: Response) => {
    try {
        const ids = await Medico.distinct('especialidad', CON_HORARIO);
        const especialidades = await Especialidad.find({ _id: { $in: ids }, activo: true }).sort({ nombre: 1 });
        const data = especialidades.map((e) => ({ id: String(e._id), nombre: e.nombre, descripcion: e.descripcion }));
        return respuestaEstandar(res, 200, true, 'Especialidades obtenidas exitosamente', data);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// Paso 2: médicos de la especialidad que tienen turnos libres, el que atiende antes primero
const getMedicosPaciente = async (
    req: Request<unknown, unknown, unknown, IQueryMedicosPaciente>,
    res: Response,
) => {
    try {
        const especialidad = await Especialidad.findOne({ _id: req.query.especialidad, activo: true });
        if (!especialidad) return respuestaEstandar(res, 404, false, 'Especialidad no encontrada');

        const medicos = await Medico.find({ ...CON_HORARIO, especialidad: especialidad._id })
            .select('nombre apellido horarioAtencion ausencias')
            .sort({ apellido: 1, nombre: 1 });

        const disponibilidad = await disponibilidadPorMedico(medicos);
        const lista = medicos.flatMap((m) => {
            const proximoTurno = disponibilidad.get(String(m._id))?.[0]?.primero;
            return proximoTurno ? [{ id: String(m._id), nombre: m.nombre, apellido: m.apellido, proximoTurno }] : [];
        }).sort((a, b) => a.proximoTurno.localeCompare(b.proximoTurno));

        return respuestaEstandar(res, 200, true, 'Médicos obtenidos exitosamente', {
            especialidad: { id: String(especialidad._id), nombre: especialidad.nombre },
            medicos: lista,
        });
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// Paso 3a: días con horarios libres de un médico (hasta 30 días hacia adelante)
const getDiasPaciente = async (
    req: Request<unknown, unknown, unknown, IQueryDiasPaciente>,
    res: Response,
) => {
    try {
        const medico = await Medico.findOne({ _id: req.query.medico, ...CON_HORARIO }).select('nombre apellido especialidad horarioAtencion ausencias');
        if (!medico) return respuestaEstandar(res, 404, false, 'Médico no encontrado');

        const especialidad = await Especialidad.findById(medico.especialidad);
        const dias = (await disponibilidadPorMedico([medico])).get(String(medico._id)) ?? [];

        return respuestaEstandar(res, 200, true, 'Días obtenidos exitosamente', {
            medico: { id: String(medico._id), nombre: medico.nombre, apellido: medico.apellido },
            especialidad: { id: String(medico.especialidad), nombre: especialidad?.nombre ?? '' },
            dias: dias.map(({ fecha, libres }) => ({ fecha, libres })),
        });
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// Paso 3b: horarios libres de un médico en un día, con el consultorio de cada uno
const getHorariosPaciente = async (
    req: Request<unknown, unknown, unknown, IQueryHorariosPaciente>,
    res: Response,
) => {
    try {
        const { medico: medicoId, fecha } = req.query;
        if (fecha < claveDia(new Date()) || fecha > diaLimitePaciente()) {
            return respuestaEstandar(res, 400, false, 'Esa fecha no está disponible para pedir turno');
        }

        const medico = await Medico.findOne({ _id: medicoId, ...CON_HORARIO }).select('horarioAtencion ausencias');
        if (!medico) return respuestaEstandar(res, 404, false, 'Médico no encontrado');

        const horarios = await horariosDeUnDia(medico, fecha);
        const consultorios = await Consultorio.find({
            _id: { $in: [...new Set(horarios.map((h) => h.consultorio))] },
        }).select('nombre direccion ciudad');
        const porId = new Map(consultorios.map((c) => [String(c._id), c]));

        const data = horarios.flatMap((h) => {
            const c = porId.get(h.consultorio);
            if (!c) return [];
            return [{
                inicio: h.inicio,
                hora: h.hora,
                consultorio: {
                    id: String(c._id),
                    nombre: c.nombre,
                    direccion: { calle: c.direccion.calle, numero: c.direccion.numero },
                    ciudad: c.ciudad,
                },
            }];
        });

        return respuestaEstandar(res, 200, true, 'Horarios obtenidos exitosamente', data);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// Ver mis turnos: lista simple. El servidor dice cuáles son próximos y cuáles se pueden cancelar.
const getMisTurnos = async (req: Request, res: Response) => {
    try {
        const pacienteId = req.usuario?.pacienteId;
        if (!pacienteId) return respuestaEstandar(res, 401, false, 'No autenticado');

        const turnos = await Turno.find({ paciente: pacienteId, activo: { $ne: false } })
            .populate('medico', 'nombre apellido')
            .populate('especialidad', 'nombre')
            .populate('consultorio', 'nombre direccion ciudad')
            .sort({ fechaTurno: -1 })
            .limit(50);

        const ahora = Date.now();
        const data = turnos.map((t) => {
            const proximo = t.estado === EstadoTurno.PENDIENTE && t.fechaFin.getTime() >= ahora;
            // El servidor dice si se puede reprogramar y, si no, por qué (el front lo muestra en el botón deshabilitado)
            const motivoNoReprogramar = proximo ? motivoNoReprogramarPaciente(t) : null;
            return {
                ...t.toJSON(),
                proximo,
                puedeCancelar:
                    t.estado === EstadoTurno.PENDIENTE && t.fechaTurno.getTime() - ahora >= HORAS_PARA_CANCELAR * HORA_MS,
                reprogramado: (t.reprogramaciones ?? 0) > 0,
                puedeReprogramar: proximo && motivoNoReprogramar === null,
                motivoNoReprogramar,
            };
        });

        return respuestaEstandar(res, 200, true, 'Turnos obtenidos exitosamente', data);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error interno del servidor', mensajeDeError(error));
    }
};

// Cancelar un turno propio, hasta 24 horas antes. Libera el horario (activo: false) igual que deleteTurno.
const cancelarTurnoPaciente = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const pacienteId = req.usuario?.pacienteId;
        if (!pacienteId) return respuestaEstandar(res, 401, false, 'No autenticado');

        const turno = await Turno.findOne({ _id: req.params.id, paciente: pacienteId, activo: { $ne: false } });
        if (!turno) return respuestaEstandar(res, 404, false, 'Turno no encontrado');

        if (turno.estado !== EstadoTurno.PENDIENTE) {
            return respuestaEstandar(res, 400, false, 'Solo se pueden cancelar turnos pendientes');
        }
        if (turno.fechaTurno.getTime() - Date.now() < HORAS_PARA_CANCELAR * HORA_MS) {
            return respuestaEstandar(res, 400, false, `Solo podés cancelar hasta ${HORAS_PARA_CANCELAR} horas antes. Comunicate con la salita.`);
        }

        turno.activo = false;
        turno.estado = EstadoTurno.CANCELADO;
        await turno.save();

        return respuestaEstandar(res, 200, true, 'Turno cancelado exitosamente');
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'No se pudo cancelar el turno', mensajeDeError(error));
    }
};

// Reprogramar: días con horarios libres del mismo médico y consultorio del turno (hasta 30 días)
const getDiasReprogramar = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const pacienteId = req.usuario?.pacienteId;
        if (!pacienteId) return respuestaEstandar(res, 401, false, 'No autenticado');

        const turno = await Turno.findOne({ _id: req.params.id, paciente: pacienteId, activo: { $ne: false } });
        if (!turno) return respuestaEstandar(res, 404, false, 'Turno no encontrado');

        const dias = await diasLibresEnConsultorio(String(turno.medico), String(turno.consultorio));
        return respuestaEstandar(res, 200, true, 'Días obtenidos exitosamente', {
            medico: String(turno.medico),
            consultorio: String(turno.consultorio),
            dias: dias.map(({ fecha, libres }) => ({ fecha, libres })),
        });
    } catch (error: unknown) {
        return respuestaEstandar(res, 400, false, 'No se pudieron obtener los días', mensajeDeError(error));
    }
};

// Reprogramar un turno propio: una sola vez, hasta 24 horas antes, mismo médico y consultorio
const reprogramarTurnoPaciente = async (req: Request<{ id: string }, unknown, IReprogramarTurnoDTO>, res: Response) => {
    try {
        const pacienteId = req.usuario?.pacienteId;
        if (!pacienteId) return respuestaEstandar(res, 401, false, 'No autenticado');

        const resultado = await reprogramarTurno(req.params.id, req.body.fechaTurno, pacienteId);
        if ('error' in resultado) return respuestaEstandar(res, resultado.estado, false, resultado.error);

        return respuestaEstandar(res, 200, true, 'Turno reprogramado exitosamente');
    } catch (error: unknown) {
        if (esClaveDuplicada(error)) return respuestaEstandar(res, 409, false, 'Ese horario acaba de ser tomado. Elegí otro.');
        return respuestaEstandar(res, 400, false, 'No se pudo reprogramar el turno', mensajeDeError(error));
    }
};

export {
    getDiasReprogramar,
    reprogramarTurnoPaciente,
    getEspecialidadesPaciente,
    getMedicosPaciente,
    getDiasPaciente,
    getHorariosPaciente,
    getMisTurnos,
    cancelarTurnoPaciente,
};