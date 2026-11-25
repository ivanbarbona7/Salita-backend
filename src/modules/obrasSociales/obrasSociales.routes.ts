import { Router } from 'express';
import { validarJWT } from '../../middlewares/validarJWT.middleware';
import { verificarRol } from '../../middlewares/verificarRol.middleware';
import { validarSchema } from '../../middlewares/validarDatos.middleware';
import { Rol } from '../auth/Usuario.model';
import { crearObraSocialSchema, queryObrasSocialesSchema, renombrarObraSocialSchema } from './dtos/obraSocial.schema';
import {
    crearObraSocial, desactivarObraSocial, eliminarObraSocial, getObrasSociales, reactivarObraSocial, renombrarObraSocial,
} from './obrasSociales.controller';

const router = Router();

router.use(validarJWT);

// La lista la necesitan también los pacientes (en "Mi perfil"); a ellos solo les llegan las activas
router.get('/', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA, Rol.PACIENTE), validarSchema(queryObrasSocialesSchema), getObrasSociales);

// Administrar el catálogo: admin y recepción
const gestion = verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA);
router.post('/', gestion, validarSchema(crearObraSocialSchema), crearObraSocial);
router.put('/:id', gestion, validarSchema(renombrarObraSocialSchema), renombrarObraSocial);
router.patch('/:id/desactivar', gestion, desactivarObraSocial);
router.patch('/:id/reactivar', gestion, reactivarObraSocial);
router.delete('/:id', gestion, eliminarObraSocial);

export default router;