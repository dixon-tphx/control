const source = {
  request: 'Texto pegado.txt · requisitos del usuario',
  critical: 'SOP Control Trabajos Sistemas Criticos.pdf',
  utility: 'SOP Contingencia Energia Agua.pdf',
  fire: 'SOP sistema de incendio.pdf · transcripción OCR pendiente de cotejo',
};
const step = (phase, title, role, applicability) => ({ phase, title, role, required: true, ...(applicability ? { applicability } : {}) });
const steps = (items) => items.map((item, index) => ({ ...item, id: `PASO-${index + 1}` }));
const standardContacts = ['Supervisor de Ingeniería', 'Director de Ingeniería', 'Seguridad', 'Gerencia General', 'Compras', 'Proveedor autorizado'];
function protocol(id, title, category, sources, items, options = {}) {
  return { id, title, category, version: 1, sourceFiles: sources, reviewStatus: 'draft', approvedBy: '', approvedAt: '', reviewNote: 'Plantilla sanitizada. Debe revisarse y aprobarse contra el plan vigente del hotel antes de usarse operativamente.', approvalRoles: ['Supervisor de Ingeniería'], contacts: standardContacts.map((role) => ({ role, contact: '' })), steps: steps(items), ...options };
}

export function seedProtocols() {
  const roomSteps = [
    step('Antes', 'Confirmar solicitud, habitación, avería y coordinación con Recepción / Ama de Llaves.', 'Supervisor de Ingeniería'),
    step('Antes', 'Revisar No Molestar, privacidad y autorización de ingreso. Sin consentimiento, no ingresar y coordinar una nueva visita.', 'Técnico asignado'),
    step('Acceso', 'Tocar el timbre o la puerta y anunciarse cortésmente: «Muy buenos días, mantenimiento». Repetir hasta tres veces, con espera respetuosa entre intentos. No asumir permiso por ausencia de respuesta.', 'Técnico asignado'),
    step('Acceso', 'Explicar la avería o el trabajo y confirmar el consentimiento explícito antes de ingresar.', 'Técnico asignado'),
    step('Durante', 'Proteger pertenencias, delimitar el trabajo y ejecutar solo el alcance autorizado.', 'Técnico asignado', 'entry'),
    step('Restitución', 'Verificar funcionamiento, limpieza y condición segura; informar el resultado y cualquier seguimiento.', 'Técnico asignado', 'entry'),
    step('Registro', 'Registrar el trabajo o el ingreso no autorizado, evidencia sin datos personales y comunicación al coordinador.', 'Técnico asignado'),
  ];
  const protocols = [
    protocol('SEQ-HAB-OCUPADA', 'Servicio en habitación ocupada', 'Habitaciones', [source.request], roomSteps, { requiresEntryDecision: true }),
    protocol('SEQ-HAB-LIBRE', 'Servicio en habitación desocupada', 'Habitaciones', [source.request], [
      step('Antes', 'Confirmar con Recepción / Ama de Llaves que la habitación está desocupada y autorizada para mantenimiento.', 'Supervisor de Ingeniería'),
      step('Acceso', 'Revisar No Molestar, tocar y anunciar «Mantenimiento» hasta tres veces antes de cualquier ingreso. Si hay ocupación o duda, detener el ingreso y solicitar autorización.', 'Técnico asignado'),
      step('Durante', 'Confirmar alcance, proteger superficies y realizar el trabajo autorizado.', 'Técnico asignado', 'entry'),
      step('Restitución', 'Probar funcionamiento, limpiar y comprobar cierre seguro de puertas; devolver el estado a Recepción / Ama de Llaves.', 'Técnico asignado', 'entry'),
      step('Registro', 'Registrar resultado, restricciones, evidencia y estado de liberación de la habitación.', 'Técnico asignado'),
    ], { requiresEntryDecision: true }),
    protocol('SEQ-INCENDIO', 'Fuego o falla de supresión / detección', 'Emergencias', [source.fire, source.critical], [
      step('Detección', 'Priorizar la vida. Ante humo, fuego o peligro inmediato, alertar a Seguridad y activar el plan de emergencias del hotel; no retrasar la respuesta por completar este registro.', 'Personal que detecta'),
      step('Notificación', 'Confirmar afectación desde una posición segura e informar inmediatamente al Director de Seguridad: edificio, sistema, hora, causa preliminar y estimación de restitución.', 'Ingeniería'),
      step('Activación', 'Documentar la notificación de Seguridad a Gerencia General y la activación conjunta de las medidas de contingencia.', 'Seguridad / Gerencia General'),
      step('Mitigación', 'Coordinar brigada, vigilancia permanente y rondines de Fire Watch cada 30 minutos mientras persista la afectación, según el SOP suministrado. Registrar cada rondín en notas con su hora.', 'Seguridad / Brigada'),
      step('Notificación', 'Solicitar a Finanzas la notificación formal a la aseguradora y registrar la referencia documental.', 'Finanzas'),
      step('Reparación', 'Coordinar diagnóstico y reparación con proveedor autorizado y permiso de trabajo en sistema crítico.', 'Director de Ingeniería'),
      step('Restitución', 'Documentar pruebas, normalización técnica y autorización de Seguridad / Gerencia para retirar medidas temporales.', 'Ingeniería / Seguridad / Gerencia General'),
    ], { approvalRoles: ['Director de Ingeniería', 'Director de Seguridad', 'Gerencia General'], reviewNote: 'Basado en SOP de incendio obtenido por OCR. Cotejar con el documento original y el plan vigente. Ronda de 30 minutos tomada del documento; no sustituye vigilancia permanente ni criterios de la autoridad competente.' }),
    protocol('SEQ-SISMO', 'Sismo: respuesta de ingeniería', 'Emergencias', [source.request], [
      step('Emergencia', 'Priorizar protección personal y activar la comunicación con Seguridad siguiendo el plan oficial del hotel.', 'Todo el personal'),
      step('Coordinación', 'Recibir instrucciones de la jefatura de emergencia. Utilizar únicamente rutas y puntos definidos en el plan aprobado; no ingresar a áreas dañadas.', 'Seguridad / Ingeniería'),
      step('Evaluación', 'Coordinar evaluación estructural y de sistemas por profesionales competentes. Registrar áreas restringidas y servicios afectados.', 'Director de Ingeniería'),
      step('Restitución', 'Restablecer sistemas solo tras inspección y autorización de las autoridades del plan; documentar pruebas y comunicaciones.', 'Director de Ingeniería / Seguridad'),
    ], { approvalRoles: ['Director de Ingeniería', 'Seguridad'], reviewNote: 'No se aportó el plan específico de sismo. Borrador de coordinación; incorporar el plan oficial, rutas, puntos seguros y autoridad de liberación antes de aprobar.' }),
    protocol('SEQ-TSUNAMI', 'Alerta de tsunami: coordinación', 'Emergencias', [source.request], [
      step('Alerta', 'Atender alertas oficiales y comunicar de inmediato a Seguridad y Gerencia según el plan de emergencias del hotel.', 'Personal que detecta'),
      step('Coordinación', 'Seguir las instrucciones oficiales de evacuación y los recorridos del plan aprobado. No improvisar rutas, alturas ni zonas de refugio.', 'Seguridad / Brigada'),
      step('Apoyo', 'Ingeniería brinda apoyo a continuidad o aislamiento de sistemas únicamente si lo ordena la jefatura y sin comprometer la evacuación de personas.', 'Director de Ingeniería'),
      step('Retorno', 'No autorizar retorno ni puesta en servicio hasta el visto bueno de la autoridad competente; documentar inspecciones y normalización.', 'Gerencia / Seguridad / Ingeniería'),
    ], { approvalRoles: ['Gerencia General', 'Seguridad'], reviewNote: 'Borrador sin plan de tsunami específico aportado. Debe enlazarse al plan hotelero y a la autoridad local antes de uso operativo.' }),
    protocol('SEQ-EONE', 'Falla de E-One / bombeo de aguas residuales', 'Continuidad', [source.critical, source.request], [
      step('Detección', 'Registrar ubicación, alarma, nivel aparente y riesgo de rebose desde un punto seguro; notificar al Supervisor.', 'Técnico / Operador'),
      step('Evaluación', 'Confirmar con personal competente el estado de bombas, alarmas, capacidad y redundancia; delimitar áreas afectadas.', 'Supervisor de Ingeniería'),
      step('Permiso', 'Clasificar nivel de intervención, obtener permisos y contingencia. No realizar ingreso a espacios confinados ni intervenir equipos sin autorización.', 'Director de Ingeniería'),
      step('Respuesta', 'Coordinar proveedor autorizado y medidas temporales de contención / continuidad conforme al plan aprobado; notificar áreas usuarias.', 'Supervisor / Compras'),
      step('Restitución', 'Documentar pruebas de bombeo, niveles, ausencia de alarmas, limpieza y capacidad de respaldo antes de liberar.', 'Ingeniería / Proveedor autorizado'),
    ]),
    protocol('SEQ-AGUA', 'Interrupción de agua potable / reserva baja', 'Continuidad', [source.utility, source.request], [
      step('Detección', 'Confirmar interrupción o reducción de suministro; contrastar lectura de tanque con verificación segura y registrar porcentaje de reserva REMANENTE.', 'Supervisor de Ingeniería'),
      step('Evaluación', 'Revisar con personal autorizado presión, bombas y condición de suministro. Estimar autonomía como volumen disponible ÷ consumo por hora, con unidades verificadas.', 'Ingeniería'),
      step('Coordinación', 'Consultar al proveedor de agua / AyA la causa y tiempo estimado. Si no hay estimación confiable, coordinar con Compras disponibilidad de cisterna y proveedor autorizado.', 'Supervisor / Compras'),
      step('Contingencia', 'Dirección determina medidas de consumo y prioridades según el plan; preservar servicios sanitarios, habitaciones ocupadas y cocinas.', 'Director de Ingeniería'),
      step('Reserva', 'Aplicar solo el umbral de reserva REMANENTE validado por Gerencia. El requisito de «70%» necesita aclaración; este sistema no lo convierte automáticamente a 30%.', 'Director de Ingeniería'),
      step('Restitución', 'Confirmar suministro, presión y condiciones sanitarias antes de normalizar; documentar origen del agua, recepciones y comunicación a áreas.', 'Ingeniería'),
    ], { waterReserve: true, reviewNote: 'Pendiente definir qué significa el requisito original de 70%. El umbral queda sin configurar hasta que Gerencia documente el porcentaje de reserva remanente. Capacidad y consumo requieren datos reales del sitio.' }),
    protocol('SEQ-PTAR', 'Planta de tratamiento: olor o falla', 'Continuidad', [source.request, source.critical], [
      step('Detección', 'Registrar ubicación, olor / alarma y afectación percibida sin exponerse; restringir acceso y avisar al Supervisor.', 'Personal que detecta'),
      step('Evaluación', 'Coordinar diagnóstico con operador / proveedor competente y verificar condiciones desde sitios autorizados. No ingresar a tanques ni espacios confinados.', 'Supervisor de Ingeniería'),
      step('Contingencia', 'Determinar medidas de contención y continuidad ambiental con el responsable técnico y Seguridad; comunicar áreas afectadas y permisos requeridos.', 'Director de Ingeniería'),
      step('Intervención', 'Autorizar el alcance y registrar acciones del proveedor, tiempos, parámetros y desvíos conforme al procedimiento aprobado.', 'Ingeniería / Proveedor autorizado'),
      step('Restitución', 'Confirmar parámetros y funcionamiento con el responsable técnico; registrar seguimiento de olor, condición ambiental y autorización de normalización.', 'Director de Ingeniería'),
    ]),
    protocol('SEQ-ELEVADOR', 'Ascensor detenido / persona atrapada', 'Emergencias', [source.request], [
      step('Detección', 'Avisar inmediatamente a Seguridad y al proveedor autorizado de ascensores; informar ubicación e indicios de lesión o riesgo.', 'Personal que detecta'),
      step('Acompañamiento', 'Mantener comunicación y tranquilidad; indicar a los ocupantes que esperen asistencia profesional y no intenten salir por sí mismos.', 'Seguridad'),
      step('Control', 'Asegurar el área y evitar el uso del ascensor. No abrir puertas, puentear protecciones, mover cabina ni intentar rescate técnico.', 'Seguridad / Ingeniería'),
      step('Rescate', 'La extracción y maniobras corresponden exclusivamente al proveedor o servicios de emergencia autorizados. Registrar llegada y responsable.', 'Proveedor autorizado / Emergencias'),
      step('Restitución', 'Mantener fuera de uso hasta liberación documentada del proveedor; registrar incidente, revisión técnica y comunicación a Operaciones.', 'Ingeniería / Proveedor autorizado'),
    ], { approvalRoles: ['Seguridad', 'Proveedor autorizado'], reviewNote: 'Borrador de notificación y acompañamiento. No contiene instrucciones de rescate técnico. Incorporar el plan del proveedor y del hotel antes de aprobar.' }),
    protocol('SEQ-ELECTRICA', 'Contingencia eléctrica y respaldo', 'Continuidad', [source.utility], [
      step('Detección', 'Confirmar la condición y escalar por la cadena Técnico → Supervisor → Subgerente → Director → Gerencia según impacto.', 'Supervisor de Ingeniería'),
      step('Monitoreo', 'Registrar tiempos, cargas, parámetros, combustible, alarmas y autonomía por personal competente.', 'Ingeniería'),
      step('Validación', 'Solicitar al Director aclaración del SOP: operación de 0–4 horas se superpone con reducción de cargas indicada para más de 3 horas. No aplicar umbrales automáticos ni cortes de carga desde este borrador.', 'Director de Ingeniería'),
      step('Contingencia', 'Documentar únicamente medidas autorizadas por el Director, su evaluación de respaldo y comunicación a áreas afectadas.', 'Director de Ingeniería'),
      step('Restitución', 'Coordinar restitución progresiva por personal autorizado y documentar estabilidad, alarmas, respaldo y comunicación de cierre.', 'Ingeniería'),
    ], { approvalRoles: ['Director de Ingeniería'], reviewNote: 'CONFLICTO DEL SOP: 0–4 horas frente a acción >3 horas. Requiere revisión formal. No se programan desconexiones ni cambios de carga automáticamente.' }),
  ];
  for (const level of [1, 2, 3]) {
    const roles = level === 1 ? ['Supervisor de Ingeniería'] : level === 2 ? ['Supervisor de Ingeniería', 'Subgerencia de Ingeniería', 'Director de Ingeniería'] : ['Subgerencia de Ingeniería', 'Director de Ingeniería', 'Gerencia General'];
    protocols.push(protocol(`SEQ-CRITICO-${level}`, `Permiso de trabajo en sistema crítico · Nivel ${level}`, 'Permisos críticos', [source.critical], [
      step('Evaluación previa', 'Documentar sistema, equipo / ID, ubicación, alcance, duración, servicios afectados y personal competente.', 'Supervisor de Ingeniería'),
      step('Evaluación previa', `Validar clasificación Nivel ${level}: ${level === 1 ? 'sin afectación operacional' : level === 2 ? 'afectación parcial o pérdida de redundancia con respaldo disponible' : 'parada total, pérdida de redundancia o impacto de seguridad / operación'}. Definir tiempo máximo tolerable.`, 'Supervisor de Ingeniería'),
      step('Seguridad', 'Evaluar riesgos y permisos aplicables: LOTO, electricidad, presión / gas / químicos, trabajo en caliente, altura, espacio confinado y EPP. Aplicar procedimientos aprobados por personal autorizado.', 'Supervisor / Personal autorizado'),
      step('Contingencia', 'Verificar respaldo, contingencia y criterio de suspensión. Comunicar el alcance a Seguridad, Operaciones y áreas afectadas según corresponda.', 'Supervisor / Dirección'),
      step('Verificación específica', 'Documentar según el sistema: E-One (nivel, capacidad, bombas y alarmas); generadores (suministro, combustible, batería, alarmas y ATS); supresión (zonas, panel y Fire Watch); agua potable (almacenamiento, autonomía, bombas y suministro alterno); gas LP (evaluación de aislamiento, presión, ignición, delimitación y protección por personal autorizado).', 'Supervisor de Ingeniería'),
      step('Autorización', `Documentar autorización previa de ${roles.join(' + ')} antes de iniciar la intervención.`, roles.join(' / ')),
      step('Ejecución', 'Registrar hora real de inicio, respaldo y desviaciones. Suspender ante condición insegura, pérdida de redundancia o cambio no autorizado de alcance.', 'Supervisor de Ingeniería'),
      step('Restitución', 'Confirmar finalización física, limpieza, herramientas retiradas, guardas y controles normales, retiro de aislamientos conforme procedimiento y ausencia de fugas cuando aplique.', 'Personal autorizado'),
      step('Pruebas', 'Documentar prueba funcional satisfactoria, presiones / niveles / alarmas normales, equipo en AUTO cuando corresponda y redundancia restablecida.', 'Supervisor de Ingeniería'),
      step('Liberación', 'Confirmar y documentar sistema 100% operativo, hora de liberación y notificación de cierre a áreas afectadas. Sin esta evidencia el trabajo no se considera cerrado.', 'Supervisor / Autorizadores'),
    ], { approvalRoles: roles, criticalLevel: level }));
  }
  return { protocols, protocolRuns: [], protocolSettings: { waterReserveAlertPercent: null } };
}
