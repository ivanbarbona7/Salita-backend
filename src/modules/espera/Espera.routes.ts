import { Router } from 'express';
import { validarJWT } from '../../middlewares/validarJWT.middleware';
import { verificarRol } from '../../middlewares/verificarRol.middleware';
import { validarSchema } from '../../middlewares/validarDatos.middleware';
import { Rol } from '../auth/Usuario.model';
import { asignarEsperaSchema, crearEsperaSchema, queryEsperaSchema } from './dtos/Espera.schema';
import { asignarEspera, cancelarEspera, crearEspera, getEspera, getHuecos } from './Espera.controller';

const router = Router();

// Solo el personal de la salita maneja la lista de espera
router.use(validarJWT, verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA));

router.get('/', validarSchema(queryEsperaSchema), getEspera);
router.get('/huecos', getHuecos);
router.post('/', validarSchema(crearEsperaSchema), crearEspera);
router.post('/:id/asignar', validarSchema(asignarEsperaSchema), asignarEspera);
router.patch('/:id/cancelar', cancelarEspera);

export default router;