import { Router } from 'express';
import { getTurnos, getDisponibilidad, createTurno, deleteTurno, marcarAtendido, marcarNoAsistio, deshacerNoAsistio, crearTurnoPaciente, reprogramarTurnoPersonal, cancelarTurno, cancelarTurnos } from './turnos.controller';
import { validarSchema } from '../../middlewares/validarDatos.middleware';
import { CrearTurnoSchema, queryDisponibilidadSchema, reprogramarTurnoSchema, queryListadoTurnosSchema, cancelarTurnosSchema } from './dtos/turno.schema';
import { validarJWT } from '../../middlewares/validarJWT.middleware';
import { verificarRol } from '../../middlewares/verificarRol.middleware';
import { Rol } from '../auth/Usuario.model';
import { soloConCuenta } from '../../middlewares/soloConCuenta.middleware';
import {
    getEspecialidadesPaciente, getMedicosPaciente, getDiasPaciente, getHorariosPaciente, getMisTurnos, cancelarTurnoPaciente, getDiasReprogramar, reprogramarTurnoPaciente,
} from './Turnos.paciente.controller';
import { getMisTurnosMedico, marcarAtendidoMedico } from './Turnos.medico.controller';
import { queryTurnosMedicoSchema } from './dtos/Turno.medico.schema';
import { queryMedicosPacienteSchema, queryDiasPacienteSchema, queryHorariosPacienteSchema } from './dtos/Turnos.paciente.schema';

const router = Router();

// PACIENTE
router.post('/paciente', validarJWT, verificarRol(Rol.PACIENTE), crearTurnoPaciente);
router.get('/paciente', validarJWT, verificarRol(Rol.PACIENTE), soloConCuenta, getMisTurnos);
router.get('/paciente/especialidades', validarJWT, verificarRol(Rol.PACIENTE), getEspecialidadesPaciente);
router.get('/paciente/medicos', validarJWT, verificarRol(Rol.PACIENTE), validarSchema(queryMedicosPacienteSchema), getMedicosPaciente);
router.get('/paciente/dias', validarJWT, verificarRol(Rol.PACIENTE), validarSchema(queryDiasPacienteSchema), getDiasPaciente);
router.get('/paciente/horarios', validarJWT, verificarRol(Rol.PACIENTE), validarSchema(queryHorariosPacienteSchema), getHorariosPaciente);
router.patch('/paciente/:id/cancelar', validarJWT, verificarRol(Rol.PACIENTE), soloConCuenta, cancelarTurnoPaciente);
router.get('/paciente/:id/dias-reprogramar', validarJWT, verificarRol(Rol.PACIENTE), soloConCuenta, getDiasReprogramar);
router.patch('/paciente/:id/reprogramar', validarJWT, verificarRol(Rol.PACIENTE), soloConCuenta, validarSchema(reprogramarTurnoSchema), reprogramarTurnoPaciente);

// MÉDICO: su agenda y marcar atendido solo sus turnos
router.get('/medico', validarJWT, verificarRol(Rol.MEDICO), validarSchema(queryTurnosMedicoSchema), getMisTurnosMedico);
router.patch('/medico/:id/atendido', validarJWT, verificarRol(Rol.MEDICO), marcarAtendidoMedico);

// Horarios libres (lo usan el formulario del personal y, más adelante, el pedido de turno del paciente)
router.get('/disponibilidad', validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA, Rol.PACIENTE), validarSchema(queryDisponibilidadSchema), getDisponibilidad);

// PERSONAL
router.get('/', validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(queryListadoTurnosSchema), getTurnos);
router.post('/', validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(CrearTurnoSchema), createTurno);
// Cancelar turnos pendientes (libera el horario): de a varios y de a uno
router.post('/cancelar-varios', validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(cancelarTurnosSchema), cancelarTurnos);
router.patch('/:id/cancelar', validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), cancelarTurno);
router.patch('/:id/reprogramar', validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(reprogramarTurnoSchema), reprogramarTurnoPersonal);
router.patch('/:id/no-asistio', validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), marcarNoAsistio);
router.patch('/:id/deshacer-no-asistio', validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), deshacerNoAsistio);
router.patch('/:id', validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), marcarAtendido);
// Eliminar (cualquier estado) queda solo para el admin
router.delete('/:id', validarJWT, verificarRol(Rol.ADMIN), deleteTurno);

export default router;