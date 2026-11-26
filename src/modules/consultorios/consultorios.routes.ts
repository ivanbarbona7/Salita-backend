import { Router } from 'express';
import { validarSchema } from '../../middlewares/validarDatos.middleware.js';
import {
    getConsultorios,
    getConsultorioById,
    getAgendaConsultorios,
    createConsultorio,
    modificarConsultorio,
    desactivarConsultorio,
    deleteConsultorio,
    agregarCierreConsultorio,
    quitarCierreConsultorio,
} from './consultorios.controller.js';
import { actualizarConsultorioSchema, crearConsultorioSchema, queryConsultoriosSchema } from './dtos/consultorio.schema.js';
import { validarJWT } from '../../middlewares/validarJWT.middleware.js';
import { verificarRol } from '../../middlewares/verificarRol.middleware.js';
import { crearRangoSchema } from '../../utils/rangoFechas.js';
import { Rol } from '../auth/Usuario.model.js';

const router = Router();

// verificarRol necesita saber quién es el usuario: el token se valida primero, en todas las rutas
router.use(validarJWT);

// Ver: admin, recepción y médicos. Crear, editar y desactivar: solo admin.
router.get('/', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA, Rol.MEDICO), validarSchema(queryConsultoriosSchema), getConsultorios);
// Agenda de todos los consultorios (antes de '/:id' para que no la tome como un id)
router.get('/agenda', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA, Rol.MEDICO), getAgendaConsultorios);

router.get('/:id', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA, Rol.MEDICO), getConsultorioById);

router.post('/', verificarRol(Rol.ADMIN), validarSchema(crearConsultorioSchema), createConsultorio);

// Cierres (feriados, obras): solo admin
router.post('/:id/cierres', verificarRol(Rol.ADMIN), validarSchema(crearRangoSchema), agregarCierreConsultorio);
router.delete('/:id/cierres/:cierreId', verificarRol(Rol.ADMIN), quitarCierreConsultorio);

// Antes había dos PATCH /:id y la primera tapaba a la segunda: editar nunca se ejecutaba.
router.put('/:id', verificarRol(Rol.ADMIN), validarSchema(actualizarConsultorioSchema), modificarConsultorio);
router.patch('/:id/desactivar', verificarRol(Rol.ADMIN), desactivarConsultorio);

// Antes no tenía verificarRol: cualquier usuario con token podía desactivar consultorios.
router.delete('/:id', verificarRol(Rol.ADMIN), deleteConsultorio);

export default router;