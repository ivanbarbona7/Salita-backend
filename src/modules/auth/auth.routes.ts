import { Router } from 'express';
import { registrarUsuario, loginUsuario } from './auth.controller.js';
import { validarJWT } from '../../middlewares/validarJWT.middleware.js';


const router = Router();

router.post('/register', validarJWT, registrarUsuario);
router.post('/login', loginUsuario);

export default router;