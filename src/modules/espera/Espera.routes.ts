import { Router } from 'express';
import { validarJWT } from '../../middlewares/validarJWT.middleware.js';
import { verificarRol } from '../../middlewares/verificarRol.middleware.js';
import { validarSchema } from '../../middlewares/validarDatos.middleware.js';
import { Rol } from '../auth/Usuario.model.js';
import { asignarEsperaSchema, crearEsperaSchema, queryEsperaSchema } from './dtos/Espera.schema.js';
import { asignarEspera, cancelarEspera, crearEspera, getEspera, getHuecos } from './Espera.controller.js';

const router = Router();

// Solo el personal de la salita maneja la lista de espera
router.use(validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA));

router.get('/', validarSchema(queryEsperaSchema), getEspera);
router.get('/huecos', getHuecos);
router.post('/', validarSchema(crearEsperaSchema), crearEspera);
router.post('/:id/asignar', validarSchema(asignarEsperaSchema), asignarEspera);
router.patch('/:id/cancelar', cancelarEspera);

export default router;