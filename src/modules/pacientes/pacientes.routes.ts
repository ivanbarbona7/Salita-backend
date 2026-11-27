import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
    createPaciente,
    desactivarPaciente,
    getPacienteById,
    getPacientes,
    modificarPaciente,
    reactivarPaciente,
} from './pacientes.controller.js';
import { validarSchema } from '../../middlewares/validarDatos.middleware.js';
import { actualizarPacienteSchema, crearPacienteSchema, queryPacientesSchema } from './dtos/Paciente.schema.js';
import { validarJWT } from '../../middlewares/validarJWT.middleware.js';
import { verificarRol } from '../../middlewares/verificarRol.middleware.js';
import { Rol } from '../auth/Usuario.model.js';
import { ingresoRapido } from './ingreso.controller.js';
import { soloConCuenta } from '../../middlewares/soloConCuenta.middleware.js';
import { getMiPerfil, actualizarMiPerfil, cambiarMiPassword } from './Paciente.yo.controller.js';
import { actualizarPerfilPacienteSchema, cambiarPasswordPacienteSchema } from './dtos/Paciente.perfil.schema.js';

const router = Router();

// Pública (sin login): ingreso rápido del paciente, con límite de intentos
const limiteIngreso = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { message: 'Demasiados intentos. Probá más tarde.' },
});
router.post('/ingreso', limiteIngreso, ingresoRapido);

// Todo lo que está debajo exige token. verificarRol necesita que validarJWT haya corrido antes
// (si no, responde 500 "se intentó verificar el rol sin validar el token").
router.use(validarJWT);

// El paciente con cuenta ve y edita su propio perfil. Van ANTES de '/:id' para que "yo" no se tome como un id.
router.get('/yo', verificarRol(Rol.PACIENTE), soloConCuenta, getMiPerfil);
router.put('/yo', verificarRol(Rol.PACIENTE), soloConCuenta, validarSchema(actualizarPerfilPacienteSchema), actualizarMiPerfil);
router.patch('/yo/password', verificarRol(Rol.PACIENTE), soloConCuenta, validarSchema(cambiarPasswordPacienteSchema), cambiarMiPassword);

// Lista paginada (?q=&page=&limit=&sort=&order=)
router.get('/', verificarRol(Rol.ADMIN, Rol.MEDICO, Rol.RECEPCIONISTA), validarSchema(queryPacientesSchema), getPacientes);

// Detalle de un paciente (lo usan Detalle y Editar)
router.get('/:id', verificarRol(Rol.ADMIN, Rol.MEDICO, Rol.RECEPCIONISTA), getPacienteById);

router.post('/', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), validarSchema(crearPacienteSchema), createPaciente);

// Editar: el DNI solo lo cambia el ADMIN (se controla dentro de modificarPaciente)
router.put('/:id', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA, Rol.MEDICO), validarSchema(actualizarPacienteSchema), modificarPaciente);

// Desactivar: ruta propia (antes compartía PATCH /:id con modificar y la segunda nunca se ejecutaba)
router.patch('/:id/desactivar', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), desactivarPaciente);

router.patch('/:id/reactivar', verificarRol(Rol.ADMIN, Rol.RECEPCIONISTA), reactivarPaciente);

// No hay DELETE: el borrado definitivo se hace a mano en la base de datos.

export default router;