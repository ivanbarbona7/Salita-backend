import {Document, Types} from 'mongoose';
import type { CategoriaEspecialidad } from './especialidad.categoria.js';

export interface IEspecialidad extends Document {
    id?: Types.ObjectId;
    nombre: string;
    descripcion: string;
    activo?: boolean;
    categoria: CategoriaEspecialidad;
}