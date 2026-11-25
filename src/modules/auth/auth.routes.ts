import { Router } from 'express';
import { registrarUsuario, loginUsuario } from './auth.controller';
import { validarJWT } from '../../middlewares/validarJWT.middleware';


const router = Router();

router.post('/register', validarJWT, registrarUsuario);
router.post('/login', loginUsuario);

export default router;