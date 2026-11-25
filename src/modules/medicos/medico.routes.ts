import  { Router } from 'express';
import { validarSchema } from '../../middlewares/validarDatos.middleware';
import {
    getMedicos,
    actualizarPerfilMedico,
    cambiarPasswordMedico,
    getMedicoById,
    createMedico,
    updateMedico,
    actualizarHorarioMedico,
    getOcupacionMedico,
    deleteMedico,
    desactivarMedico,
    agregarAusenciaMedico,
    quitarAusenciaMedico,
} from './medicos.controller';
import {
    actualizarHorarioSchema,
    actualizarMedicoSchema,
    actualizarPerfilMedicoSchema,
    cambiarPasswordMedicoSchema,
    crearMedicoSchema,
} from './dtos/medico.schema';
import { crearRangoSchema } from '../../utils/rangoFechas';
import { medicoDelToken } from '../../middlewares/medicoDelToken.middleware';
import { validarJWT } from '../../middlewares/validarJWT.middleware';
import { verificarRol } from '../../middlewares/verificarRol.middleware';
import { Rol } from '../auth/Usuario.model';

const router = Router();

// verificarRol necesita saber quién es el usuario: el token se valida primero, en todas las rutas
router.use(validarJWT);
router.get('/',verificarRol(Rol.ADMIN, Rol.MEDICO, Rol.RECEPCIONISTA), getMedicos);

// MÉDICO: sus propios datos. "/yo" va antes de "/:id" para que no se tome "yo" como un id.
// El médico sale del token (medicoDelToken): nunca puede tocar los datos de otro.
const propio = [verificarRol(Rol.MEDICO), medicoDelToken];
router.get('/yo', ...propio, getMedicoById);
router.put('/yo', ...propio, validarSchema(actualizarPerfilMedicoSchema), actualizarPerfilMedico);
router.patch('/yo/password', verificarRol(Rol.MEDICO), validarSchema(cambiarPasswordMedicoSchema), cambiarPasswordMedico);
router.get('/yo/ocupacion', ...propio, getOcupacionMedico);
router.put('/yo/horario', ...propio, validarSchema(actualizarHorarioSchema), actualizarHorarioMedico);
router.post('/yo/ausencias', ...propio, validarSchema(crearRangoSchema), agregarAusenciaMedico);
router.delete('/yo/ausencias/:ausenciaId', ...propio, quitarAusenciaMedico);

// NUEVO: detalle de un médico (lo usa la pantalla de horario; el controlador ya existía pero no tenía ruta)
router.get('/:id', verificarRol(Rol.ADMIN, Rol.MEDICO, Rol.RECEPCIONISTA), getMedicoById);

// NUEVO: horarios de otros médicos en los consultorios de este (para avisar choques al cargar su horario)
router.get('/:id/ocupacion', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), getOcupacionMedico);

// Ausencias de cualquier médico (por si avisa por teléfono): admin y recepción
router.post('/:id/ausencias', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(crearRangoSchema), agregarAusenciaMedico);
router.delete('/:id/ausencias/:ausenciaId', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), quitarAusenciaMedico);

router.post('/', verificarRol(Rol.ADMIN),validarSchema(crearMedicoSchema), createMedico);
router.patch('/:id', verificarRol(Rol.ADMIN), validarSchema(crearMedicoSchema), desactivarMedico);
router.put('/:id', verificarRol(Rol.ADMIN), validarSchema(actualizarMedicoSchema), updateMedico);

// NUEVO: guardar el horario de atención (lo editan admin y recepción)
router.put('/:id/horario', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(actualizarHorarioSchema), actualizarHorarioMedico);

router.delete('/:id', verificarRol(Rol.ADMIN), deleteMedico);

export default router;