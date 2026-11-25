export enum EstadoTurno {
    PENDIENTE = "pendiente",
    ATENDIDO = "atendido",
    CANCELADO = "cancelado",
    // El paciente no se presentó a su turno (el horario se perdió: no se libera)
    NO_ASISTIO = "no_asistio",
}