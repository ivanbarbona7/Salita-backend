import {Router} from 'express';
import { validarSchema } from '../../middlewares/validarDatos.middleware.js';
import { getEspecialidades, getEspecialidadById, createEspecialidad, updateEspecialidad, deleteEspecialidad, desactivarEspecialidad } from './especialidades.controller.js';
import { crearEspecialidadSchema } from './dtos/especialidad.schema.js';
import { verificarRol } from '../../middlewares/verificarRol.middleware.js';
import { Rol } from '../auth/Usuario.model.js';
import { validarJWT } from '../../middlewares/validarJWT.middleware.js';

const router = Router();
router.use(validarJWT);
router.get('/', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), getEspecialidades);
router.get('/:id',verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), getEspecialidadById);
router.post('/', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(crearEspecialidadSchema), createEspecialidad);
router.put('/:id', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(crearEspecialidadSchema), updateEspecialidad);
router.patch('/:id', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(crearEspecialidadSchema), desactivarEspecialidad);
router.delete('/:id',verificarRol(Rol.ADMIN), deleteEspecialidad);

export default router;