import { Router } from 'express';
import {
    crearPersonal,
    desactivarPersonal,
    getPersonal,
    getPersonalById,
    modificarPersonal,
    reactivarPersonal,
} from './Personal.controller.js';
import { validarSchema } from '../../middlewares/validarDatos.middleware.js';
import { validarJWT } from '../../middlewares/validarJWT.middleware.js';
import { verificarRol } from '../../middlewares/verificarRol.middleware.js';
import { Rol } from '../auth/Usuario.model.js';
import { actualizarPersonalSchema, crearPersonalSchema, queryPersonalSchema } from './dtos/personal.schema.js';

const router = Router();

router.use(validarJWT);

// Ver: administradores y recepción (la recepción ve menos datos). Cargar, editar y desactivar: solo el administrador.
router.get('/', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(queryPersonalSchema), getPersonal);
router.get('/:id', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), getPersonalById);

router.post('/', verificarRol(Rol.ADMIN), validarSchema(crearPersonalSchema), crearPersonal);
router.put('/:id', verificarRol(Rol.ADMIN), validarSchema(actualizarPersonalSchema), modificarPersonal);
router.patch('/:id/desactivar', verificarRol(Rol.ADMIN), desactivarPersonal);
router.patch('/:id/reactivar', verificarRol(Rol.ADMIN), reactivarPersonal);

export default router;