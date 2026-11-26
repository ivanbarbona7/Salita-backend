import { Router } from 'express';
import { validarSchema } from '../../middlewares/validarDatos.middleware.js';
import { validarJWT } from '../../middlewares/validarJWT.middleware.js';
import { verificarRol } from '../../middlewares/verificarRol.middleware.js';
import { Rol } from '../auth/Usuario.model.js';
import {
    getHistoriaDePaciente,
    guardarAntecedentes,
    agregarConsulta,
    getTurnosParaAtender,
} from './historiaClinica.controller.js';
import { actualizarAntecedentesSchema, crearConsultaSchema } from './dtos/historiaClinica.schema.js';

const router = Router();

// Todo lo de historia clínica exige sesión. Los datos clínicos son sensibles: nada es público.
router.use(validarJWT);

// Ver la historia de un paciente y actualizar sus antecedentes: ADMIN y MEDICO
router.get('/paciente/:pacienteId', verificarRol(Rol.ADMIN, Rol.MEDICO), getHistoriaDePaciente);
router.put(
    '/paciente/:pacienteId/antecedentes',
    verificarRol(Rol.ADMIN, Rol.MEDICO),
    validarSchema(actualizarAntecedentesSchema),
    guardarAntecedentes,
);

// Agregar una consulta (solo agregar: no se edita ni se borra) y ver qué turnos se pueden atender: solo MEDICO
router.get('/paciente/:pacienteId/turnos-pendientes', verificarRol(Rol.MEDICO), getTurnosParaAtender);
router.post(
    '/paciente/:pacienteId/consultas',
    verificarRol(Rol.MEDICO),
    validarSchema(crearConsultaSchema),
    agregarConsulta,
);

export default router;