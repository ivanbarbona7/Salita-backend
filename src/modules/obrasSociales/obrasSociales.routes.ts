import { Router } from 'express';
import { validarJWT } from '../../middlewares/validarJWT.middleware.js';
import { verificarRol } from '../../middlewares/verificarRol.middleware.js';
import { validarSchema } from '../../middlewares/validarDatos.middleware.js';
import { Rol } from '../auth/Usuario.model.js';
import { crearObraSocialSchema, queryObrasSocialesSchema, renombrarObraSocialSchema } from './dtos/obraSocial.schema.js';
import {
    crearObraSocial, desactivarObraSocial, eliminarObraSocial, getObrasSociales, reactivarObraSocial, renombrarObraSocial,
} from './obrasSociales.controller.js';

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