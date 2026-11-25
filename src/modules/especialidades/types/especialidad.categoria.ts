export const CATEGORIAS_ESPECIALIDAD = ['Clínica', 'Quirúrgica', 'Diagnóstico', 'Terapéutica'] as const;
export type CategoriaEspecialidad = (typeof CATEGORIAS_ESPECIALIDAD)[number];