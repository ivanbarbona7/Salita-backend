import type {Application} from 'express';

import * as dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import express from 'express';
import { connectDB } from'./src/config/database';



connectDB();

import auditMiddleware from'./src/middlewares/auditoria.middleware';
import errorHandlerMiddleware from'./src/middlewares/errorHandler.middleware';
import turnosRoutes  from './src/modules/turnos/turnos.routes';
import pacientesRoutes from './src/modules/pacientes/pacientes.routes';
import historiaClinicasRoutes from './src/modules/historiaClinicas/HistoriaClinicas.routes';
import especialidadRoutes from './src/modules/especialidades/especialidad.routes';
import medicoRoutes from'./src/modules/medicos/medico.routes';
import personalRoutes from './src/modules/personal/Personal.routes';
import consultorioRoutes from './src/modules/consultorios/consultorios.routes';
import authRoutes from './src/modules/auth/auth.routes';
import esperaRoutes from './src/modules/espera/Espera.routes';
import obrasSocialesRoutes from './src/modules/obrasSociales/obrasSociales.routes';






const app = express();
app.use(express.json());
app.use(auditMiddleware);
app.use(cors());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/turnos', turnosRoutes);
app.use('/api/v1/pacientes', pacientesRoutes);
app.use('/api/v1/historias-clinicas', historiaClinicasRoutes);
app.use('/api/v1/especialidades', especialidadRoutes);
app.use('/api/v1/medicos', medicoRoutes);
app.use('/api/v1/consultorios', consultorioRoutes);
app.use('/api/v1/ingreso/rapido', pacientesRoutes); // Agregado para manejar el ingreso rápido de pacientes
app.use('/api/v1/personal/', personalRoutes); // Agregado para manejar el personal
app.use('/api/v1/espera', esperaRoutes);
app.use('/api/v1/obras-sociales', obrasSocialesRoutes);


app.use(errorHandlerMiddleware);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`============SERVIDOR MUNICIPAL ACTIVO==========`);
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    console.log(`Entorno: ${process.env.ENTORNO || 'Local'} `);
    console.log(`=====================   ==========================`);
});