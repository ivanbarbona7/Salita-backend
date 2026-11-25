# spec - funsion `verificarDisponibilidadTurno`

**Proposito:** validar que un bloque de tiempo de 30 minutos este libre para un medio especifico antes de guardar.

**Entradas (Parametros):** 
- `MedicoId`: string (ObjedId Valido).
- ` fechaDesada`: Date (ISO 8601)
 
 **Logica de Negocio:** 
 1. Calcular `fechaFin` sumando 30 minutos a `fechaDesada`.
 2. Consultar a Mongoose (modelo turno) si algun turno con estado 'pendiente' o 'atendido'para ese `medicoId` que se solape con la franja [fechaDesada - fechaFin].
 3. Un solapamiento ocurre si:
 (turno.fecha < fechaFin) AND (turno.fechaFin > fechaDeseada).

 **Salida:**
 - Retorna `true` si esta disponible (no hay solapamiento).
 - Retorna `false` si el bloque esta ocupado.