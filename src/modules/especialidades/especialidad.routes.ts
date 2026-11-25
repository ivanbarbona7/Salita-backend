import {Router} from 'express';
import { validarSchema } from '../../middlewares/validarDatos.middleware';
import { getEspecialidades, getEspecialidadById, createEspecialidad, updateEspecialidad, deleteEspecialidad, desactivarEspecialidad } from './especialidades.controller';
import { crearEspecialidadSchema } from './dtos/especialidad.schema';
import { verificarRol } from '../../middlewares/verificarRol.middleware';
import { Rol } from '../auth/Usuario.model';
import { validarJWT } from '../../middlewares/validarJWT.middleware';

const router = Router();
router.use(validarJWT);
router.get('/', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), getEspecialidades);
router.get('/:id',verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), getEspecialidadById);
router.post('/', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(crearEspecialidadSchema), createEspecialidad);
router.put('/:id', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(crearEspecialidadSchema), updateEspecialidad);
router.patch('/:id', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(crearEspecialidadSchema), desactivarEspecialidad);
router.delete('/:id',verificarRol(Rol.ADMIN), deleteEspecialidad);

export default router;