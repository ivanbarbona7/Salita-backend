// Un consultorio atiende una especialidad si la tiene en su lista o si está marcado
// para atender todas. Se usa en la validación de horarios de médicos y de turnos.
interface ConEspecialidades {
    todasLasEspecialidades?: boolean | undefined;
    especialidades: unknown[];
}

export const atiendeEspecialidad = (consultorio: ConEspecialidades, especialidadId: string): boolean =>
    consultorio.todasLasEspecialidades === true ||
    consultorio.especialidades.some((e) => String(e) === String(especialidadId));