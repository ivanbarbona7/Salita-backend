import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import HistoriaClinica from './HistoriaClinica.model';
import Paciente from '../pacientes/Paciente.model';
import Turno from '../turnos/Turno.model';
import { EstadoTurno } from '../turnos/types/TurnoEstado.enum';
import { respuestaEstandar } from '../../utils/respuestaEstandar';
import { sumarDias, hoyAR } from '../../utils/rangoFechas';
import type { IAntecedentesDTO, IConsultaDTO } from './dtos/historiaClinica.schema';

// Historia clínica: una por paciente, con sus antecedentes y una lista de consultas que solo se agregan.
// Todas las rutas exigen sesión; ver y editar antecedentes: ADMIN y MEDICO; agregar consultas: solo MEDICO.

const mensajeError = (error: unknown) => (error instanceof Error ? error.message : null);

type ParamsPaciente = { pacienteId: string };

const ANTECEDENTES_VACIOS: IAntecedentesDTO = {
    alergias: [],
    enfermedadesCronicas: [],
    medicamentosHabituales: [],
    cirugiasPrevias: [],
    internacionesPrevias: [],
    antecedentesFamiliares: [],
    vacunas: [],
    habitos: { tabaquismo: false, alcohol: false, actividadFisica: 'Ninguna' },
    otros: '',
};

// Devuelve el error ya enviado, o null si el paciente existe
const verificarPaciente = async (pacienteId: string, res: Response) => {
    if (!isValidObjectId(pacienteId)) return respuestaEstandar(res, 400, false, 'ID de paciente inválido');
    const existe = await Paciente.exists({ _id: pacienteId });
    if (!existe) return respuestaEstandar(res, 404, false, 'Paciente no encontrado');
    return null;
};

// GET /historias-clinicas/paciente/:pacienteId
// Si el paciente todavía no tiene historia, devuelve data: null (la pantalla ofrece crearla).
const getHistoriaDePaciente = async (req: Request<ParamsPaciente>, res: Response) => {
    try {
        const error = await verificarPaciente(req.params.pacienteId, res);
        if (error) return error;

        const historia = await HistoriaClinica.findOne({ paciente: req.params.pacienteId })
            .populate('consultas.medico', 'nombre apellido matricula');

        if (!historia) {
            return respuestaEstandar(res, 200, true, 'El paciente todavía no tiene historia clínica', null);
        }

        // Las consultas más nuevas primero
        const json = historia.toJSON() as unknown as { consultas: { fecha: Date }[] };
        json.consultas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
        return respuestaEstandar(res, 200, true, 'Historia clínica obtenida exitosamente', json);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al obtener la historia clínica', mensajeError(error));
    }
};

// PUT /historias-clinicas/paciente/:pacienteId/antecedentes  (crea la historia si no existía)
const guardarAntecedentes = async (req: Request<ParamsPaciente, unknown, IAntecedentesDTO>, res: Response) => {
    try {
        const error = await verificarPaciente(req.params.pacienteId, res);
        if (error) return error;

        // Se completan los campos que falten, así siempre se guarda el bloque entero
        const antecedentes: IAntecedentesDTO = {
            ...ANTECEDENTES_VACIOS,
            ...req.body,
            habitos: { ...ANTECEDENTES_VACIOS.habitos, ...req.body.habitos },
        };

        const historia = await HistoriaClinica.findOneAndUpdate(
            { paciente: req.params.pacienteId },
            { $set: { antecedentes } },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        ).populate('consultas.medico', 'nombre apellido matricula');

        return respuestaEstandar(res, 200, true, 'Antecedentes guardados correctamente', historia);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al guardar los antecedentes', mensajeError(error));
    }
};

// POST /historias-clinicas/paciente/:pacienteId/consultas  (solo MEDICO; el médico sale del token)
const agregarConsulta = async (req: Request<ParamsPaciente, unknown, IConsultaDTO>, res: Response) => {
    let turnoTomado: string | null = null;
    try {
        const medicoId = req.usuario?.medicoId;
        if (!medicoId) return respuestaEstandar(res, 403, false, 'Tu cuenta no está vinculada a un médico');

        const error = await verificarPaciente(req.params.pacienteId, res);
        if (error) return error;

        const { turno, ...datos } = req.body;

        // Si se eligió un turno, tiene que ser de este médico y de este paciente, y estar pendiente.
        // Se marca como atendido en el mismo paso (condicional, para que no se atienda dos veces).
        if (turno) {
            const marcado = await Turno.findOneAndUpdate(
                {
                    _id: turno,
                    medico: medicoId,
                    paciente: req.params.pacienteId,
                    estado: EstadoTurno.PENDIENTE,
                    activo: { $ne: false },
                },
                { estado: EstadoTurno.ATENDIDO },
            );
            if (!marcado) {
                return respuestaEstandar(res, 409, false, 'Ese turno no está disponible para atender (no es tuyo, no es de este paciente o ya fue atendido o cancelado)');
            }
            turnoTomado = String(marcado._id);
        }

        const historia = await HistoriaClinica.findOneAndUpdate(
            { paciente: req.params.pacienteId },
            {
                $push: {
                    consultas: {
                        ...datos,
                        medico: medicoId,
                        ...(turno ? { turno } : {}),
                        fecha: new Date(), // la fecha la pone el servidor: no se puede cambiar
                    },
                },
            },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        ).populate('consultas.medico', 'nombre apellido matricula');

        return respuestaEstandar(res, 201, true, 'Consulta agregada a la historia clínica', historia);
    } catch (error: unknown) {
        // Si la consulta no se pudo guardar, el turno vuelve a quedar pendiente
        if (turnoTomado) {
            await Turno.updateOne({ _id: turnoTomado, estado: EstadoTurno.ATENDIDO }, { estado: EstadoTurno.PENDIENTE }).catch(() => undefined);
        }
        return respuestaEstandar(res, 500, false, 'Error al agregar la consulta', mensajeError(error));
    }
};

// GET /historias-clinicas/paciente/:pacienteId/turnos-pendientes  (solo MEDICO)
// Turnos de este médico con este paciente que se pueden atender ahora (de hoy o anteriores, todavía pendientes).
const getTurnosParaAtender = async (req: Request<ParamsPaciente>, res: Response) => {
    try {
        const medicoId = req.usuario?.medicoId;
        if (!medicoId) return respuestaEstandar(res, 403, false, 'Tu cuenta no está vinculada a un médico');

        const error = await verificarPaciente(req.params.pacienteId, res);
        if (error) return error;

        // Fin del día de hoy en Argentina (UTC-3) = 03:00 UTC del día siguiente
        const finDeHoy = new Date(`${sumarDias(hoyAR(), 1)}T03:00:00Z`);

        const turnos = await Turno.find({
            medico: medicoId,
            paciente: req.params.pacienteId,
            estado: EstadoTurno.PENDIENTE,
            activo: { $ne: false },
            fechaTurno: { $lt: finDeHoy },
        })
            .select('fechaTurno')
            .sort({ fechaTurno: -1 })
            .limit(10);

        return respuestaEstandar(res, 200, true, 'Turnos obtenidos exitosamente', turnos);
    } catch (error: unknown) {
        return respuestaEstandar(res, 500, false, 'Error al obtener los turnos', mensajeError(error));
    }
};

// No hay borrado ni edición de consultas: la historia clínica debe conservarse completa.
export { getHistoriaDePaciente, guardarAntecedentes, agregarConsulta, getTurnosParaAtender };