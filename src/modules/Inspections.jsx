import { useMemo, useState } from 'react';
import { ArrowRight, Camera, CheckCircle2, ClipboardCheck, Download, History, Hotel, MapPin, Plus, Printer, Search, Wrench } from 'lucide-react';
import { BUILDINGS, TEAM, Modal, Field, PhotoInput, exportWorkbook, uid, todayISO, formatDate } from '../shared';
import { findOpenDuplicate } from '../domain';

const CHECKLIST_REFERENCE = 'Externo N4 · puntos de inspección adaptados; secuencia hotelera 360';
const actor = (user) => ({ authorId: user?.id || 'legacy-unknown', authorName: user?.name || 'Autor no registrado', authorRole: user?.role || '', ...(user?.isDemo ? { demo: true } : {}) });

const roomChecks = [
  ['entry-frame', 'Ingreso · Marco, bisagras, cerradura y sellos de la puerta'],
  ['door45', 'Seguridad · Soltar la puerta a 45°: debe cerrar sola completamente'],
  ['room-sign', 'Ingreso · Número de habitación y señalización legibles, firmes e iluminados cuando aplique'],
  ['floor-hazards', 'Ingreso · Piso, desniveles y alfombras sin riesgos de tropiezo o deslizamiento'],
  ['right-outlets', 'Lado derecho · Tomacorrientes firmes, sin daños ni recalentamiento'],
  ['right-switches', 'Lado derecho · Interruptores y controles de iluminación'],
  ['right-lights', 'Lado derecho · Luminarias, lámparas y luces de lectura'],
  ['climate', 'Climatización · Aire acondicionado, termostato, filtros y drenajes'],
  ['grilles', 'Climatización · Rejillas y difusores firmes, limpios y sin elementos sueltos'],
  ['window', 'Ventanas · Cierre, cristales, seguros y sellos'],
  ['curtains', 'Ventanas · Cortinas, rieles y control de luz'],
  ['furniture', 'Habitación · Mobiliario, uniones, cajones y superficies'],
  ['beds', 'Habitación · Base de cama, cabecera, colchón y estabilidad'],
  ['tv', 'Habitación · Televisión, controles, conexiones y señal'],
  ['minibar', 'Habitación · Minibar, refrigeración y ventilación'],
  ['bath-door', 'Baño · Puerta, herrajes, marco y apertura segura'],
  ['bath-water', 'Baño · Grifería, presión, temperatura y fugas'],
  ['bath-drains', 'Baño · Drenajes, sifones, desagües y olores'],
  ['bath-toilet', 'Baño · Inodoro, descarga, asiento y sellos'],
  ['bath-extractor', 'Baño · Extractor, ventilación y humedad'],
  ['bath-surfaces', 'Baño · Pisos, juntas, espejos y accesorios'],
  ['safe', 'Seguridad · Caja de seguridad y fijaciones'],
  ['smoke', 'Seguridad · Detector de humo: condición visible y prueba autorizada'],
  ['sprinklers', 'Seguridad · Rociadores visibles sin pintura, obstrucciones ni daños; no manipular'],
  ['emergency-phone', 'Seguridad · Teléfono de emergencia disponible y prueba según procedimiento autorizado'],
  ['evacuation', 'Seguridad · Plano de evacuación, ruta de salida y señalización visibles y despejados'],
  ['left-walls', 'Lado izquierdo · Paredes, cielo raso, pintura y humedad'],
  ['left-outlets', 'Lado izquierdo · Tomacorrientes, interruptores y luminarias'],
  ['exit', 'Cierre del recorrido · Habitación ordenada y puerta cerrada al salir'],
];
const freshChecks = () => roomChecks.map(([id, label]) => ({ id, label, status: 'unreviewed', note: '', faultDetail: '', significant: false, priority: 'medium', reference: CHECKLIST_REFERENCE, duplicateAction: 'link' }));
const mergedDraftChecks = (checks = []) => {
  const saved = new Map(checks.map((check) => [check.id, check]));
  const merged = freshChecks().map((check) => ({ ...check, ...(saved.get(check.id) || {}) }));
  return [...merged, ...checks.filter((check) => !roomChecks.some(([id]) => id === check.id))];
};
const statusLabel = { unreviewed: 'Sin revisar', ok: 'Conforme', finding: 'Hallazgo', na: 'No aplica' };
const priorityLabel = { high: 'Alta', medium: 'Media', low: 'Baja' };
const countReviewed = (checks = []) => checks.filter((check) => check.status !== 'unreviewed').length;

export function seedInspections() {
  return {
    rooms: Array.from({ length: 123 }, (_, index) => ({ id: `H${String(index + 1).padStart(3, '0')}`, number: String(index + 1).padStart(3, '0'), building: `Edificio ${['A', 'B', 'C'][Math.floor(index / 41)]}`, areaM2: 28, checks: [], photos: [], updatedAt: null, draft: false })),
    roomHistory: [],
    rounds: [],
  };
}

function roomOrder({ room, check, historyId, user }) {
  const owner = TEAM.find((member) => member.area === 'Habitaciones') || TEAM.find((member) => member.area === 'Infraestructura') || TEAM[0];
  return {
    id: uid('OT'), title: `Hab. ${room.number} · ${check.label.split('·').at(-1).trim()}`,
    description: `${check.label}\n${check.note}\nOrigen: revisión 360 ${historyId}.`,
    area: owner?.area || 'Habitaciones', building: room.building, roomId: room.id, location: `Habitación ${room.number}`,
    owner: owner?.id || '', priority: check.priority || 'medium', status: 'pending', progress: 0,
    fault: check.id === 'door45' ? 'Cierre de puerta' : check.label.split('·').at(-1).trim(), faultDetail: check.faultDetail?.trim() || check.note?.trim() || check.label,
    createdAt: new Date().toISOString(), startedAt: null, closedAt: null, source: '360', roomHistoryId: historyId,
    createdBy: user?.id || '', createdByName: user?.name || 'Autor no registrado', reports: [], findings: [],
  };
}

function DuplicateChoice({ duplicate, value, onChange }) {
  return duplicate ? <div className="alert-box" role="status"><div><strong>Ya existe un trabajo abierto: {duplicate.id}</strong><p>La misma avería y ubicación ya están registradas. La evidencia se añadirá al trabajo existente sin borrar su historial.</p><Field label="Acción ante posible duplicado"><select value={value || 'link'} onChange={(event) => onChange(event.target.value)}><option value="link">Vincular hallazgo al trabajo existente</option><option value="new">Crear otro trabajo con advertencia de duplicado</option></select></Field>{value === 'new' && <small>Se conservará la referencia al trabajo anterior para revisar esta duplicación.</small>}</div></div> : null;
}

function RoomEditor({ room, rooms, orders, onSave, onClose }) {
  const [values, setValues] = useState({ ...room, photos: room.draft ? [...(room.photos || [])] : [], checks: room.draft && room.checks?.length ? mergedDraftChecks(room.checks) : freshChecks() });
  const [error, setError] = useState('');
  const reviewed = countReviewed(values.checks);
  const findings = values.checks.filter((check) => check.status === 'finding');
  const updateCheck = (id, patch) => setValues((previous) => ({ ...previous, checks: previous.checks.map((check) => check.id === id ? { ...check, ...patch } : check) }));
  const submit = (event, finalize = true) => {
    event?.preventDefault();
    const number = values.number.trim();
    if (!number) { setError('Indica el número real de la habitación.'); return; }
    if (rooms.some((other) => other.id !== room.id && other.number.trim().toLowerCase() === number.toLowerCase())) { setError('Ya existe otra habitación con este número.'); return; }
    if (!Number.isFinite(Number(values.areaM2)) || Number(values.areaM2) <= 0) { setError('Los metros cuadrados deben ser mayores que cero.'); return; }
    if (finalize && reviewed !== values.checks.length) { setError(`Faltan ${values.checks.length - reviewed} puntos por revisar. Puedes guardar el avance como borrador.`); return; }
    if (finalize && findings.some((check) => !check.note.trim())) { setError('Describe cada hallazgo antes de finalizar la revisión.'); return; }
    onSave({ ...values, number, areaM2: Number(values.areaM2) }, finalize);
  };
  return <Modal title={`Mantenimiento 360 · Habitación ${room.number}`} wide onClose={onClose}>
    <form onSubmit={submit}>
      <div className="modal-body">
        <div className="notice"><ClipboardCheck size={20} /><div><strong>Recorrido de derecha a izquierda</strong><p>Comienza en la puerta, revisa cada punto y termina en el lado izquierdo. Las puertas deben cerrar solas al soltarlas a 45°.</p></div></div>
        <p className="muted">Referencia de plantilla: {CHECKLIST_REFERENCE}. Los puntos nuevos se añaden a los borradores; las revisiones cerradas conservan su checklist original.</p>
        <div className="form-grid">
          <Field label="Número de habitación"><input value={values.number} maxLength={20} onChange={(event) => setValues({ ...values, number: event.target.value })} required /></Field>
          <Field label="Edificio"><select aria-label="Edificio" value={values.building} onChange={(event) => setValues({ ...values, building: event.target.value })}>{BUILDINGS.map((building) => <option key={building}>{building}</option>)}</select></Field>
          <Field label="Superficie de habitación (m²)"><input type="number" min="0.1" step="0.1" value={values.areaM2} onChange={(event) => setValues({ ...values, areaM2: event.target.value })} required /></Field>
        </div>
        <div className="summary-row"><strong>{reviewed} de {values.checks.length} puntos revisados</strong><span className="badge">{findings.length} hallazgos</span></div>
        <div className="progress-track"><span className="progress-fill" style={{ width: `${reviewed / values.checks.length * 100}%` }} /></div>
        <div className="checklist">{values.checks.map((check, index) => <div className={`check-row room-check ${check.status === 'finding' ? 'has-finding' : ''}`} key={check.id}>
          <div className="room-check-heading"><span className="check-number">{String(index + 1).padStart(2, '0')}</span><label htmlFor={`check-${check.id}`}>{check.label}</label><select id={`check-${check.id}`} value={check.status} onChange={(event) => updateCheck(check.id, { status: event.target.value, significant: event.target.value === 'finding' ? check.significant : false })}>
            <option value="unreviewed">Sin revisar</option><option value="ok">Conforme</option><option value="finding">Hallazgo</option>{check.id !== 'door45' && <option value="na">No aplica</option>}
          </select></div>
          {check.status === 'finding' && <div className="finding-details"><Field label="Descripción de la reparación necesaria"><textarea rows={2} maxLength={1500} value={check.note} onChange={(event) => updateCheck(check.id, { note: event.target.value })} placeholder="Describe el daño, su ubicación y la acción requerida." /></Field><Field label="Síntoma para detectar trabajos duplicados"><input value={check.faultDetail || ''} onChange={(event) => updateCheck(check.id, { faultDetail: event.target.value })} maxLength={200} placeholder="Si se omite, se usa la descripción del hallazgo" /></Field><div className="inline-actions"><label className="checkbox-field"><input type="checkbox" checked={check.significant} onChange={(event) => updateCheck(check.id, { significant: event.target.checked })} />Hallazgo significativo: crear o vincular trabajo correctivo</label><Field label="Prioridad"><select aria-label="Prioridad" value={check.priority} onChange={(event) => updateCheck(check.id, { priority: event.target.value })}>{Object.entries(priorityLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field></div>{check.significant && <DuplicateChoice duplicate={findOpenDuplicate(orders, roomOrder({ room: values, check }))} value={check.duplicateAction} onChange={(duplicateAction) => updateCheck(check.id, { duplicateAction })} />}</div>}
        </div>)}</div>
        <h3>Evidencia fotográfica</h3><p className="muted">Adjunta imágenes de los hallazgos o del estado de la habitación.</p><PhotoInput photos={values.photos} onChange={(photos) => setValues((old) => ({ ...old, photos }))} />
        <p className="muted">La revisión registra observaciones; una prueba de seguridad debe realizarla personal autorizado según el procedimiento del hotel.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
      <div className="modal-footer"><button type="button" className="button secondary" onClick={() => submit(null, false)}>Guardar borrador</button><button className="button primary" type="submit"><CheckCircle2 size={17} />Finalizar revisión</button></div>
    </form>
  </Modal>;
}

function InspectionHistory({ item, onClose }) {
  return <Modal title={`Historial 360 · Habitación ${item.roomNumber}`} wide onClose={onClose}><div className="modal-body"><div className="summary-row"><span>{formatDate(item.date)} · {item.building}</span><span className="badge">{item.id}</span></div><p>Autor: {item.authorName || 'No registrado en revisión anterior'} · Referencia: {item.reference || 'Plantilla 360 anterior'}</p><p>{item.checks.filter((check) => check.status === 'finding').length} hallazgos · {(item.orderIds || []).length} trabajos correctivos vinculados</p><div className="checklist">{item.checks.map((check) => <div className="check-row" key={check.id}><div><strong>{check.label}</strong>{check.note && <p>{check.note}</p>}{check.significant && <small>Significativo · Prioridad {priorityLabel[check.priority]}</small>}</div><span className={`badge ${check.status === 'ok' ? 'success' : check.status === 'finding' ? 'danger' : ''}`}>{statusLabel[check.status]}</span></div>)}</div>{!!item.orderIds?.length && <p>Correctivos: {item.orderIds.join(', ')}</p>}<div className="photo-grid">{(item.photos || []).map((photo) => <figure className="photo-item" key={photo.id}><a href={photo.url} download={photo.name || 'evidencia.jpg'}><img src={photo.url} alt={photo.name || 'Evidencia de revisión'} /></a><figcaption>{photo.name}</figcaption></figure>)}</div><p className="muted">Registro cerrado, conservado sin modificación en el historial.</p></div></Modal>;
}

function RoundEditor({ round, rooms, onSave, onClose }) {
  const [values, setValues] = useState(round || { date: todayISO(), building: BUILDINGS[0], location: '', description: '', faultDetail: '', priority: 'medium', photos: [] });
  return <Modal title={round ? 'Editar hallazgo de recorrida' : 'Nueva recorrida · Foto y hallazgo'} wide onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (values.location.trim() && values.description.trim()) onSave({ ...values, location: values.location.trim(), description: values.description.trim() }); }}><div className="modal-body"><div className="form-grid"><Field label="Fecha"><input type="date" required value={values.date} onChange={(event) => setValues({ ...values, date: event.target.value })} /></Field><Field label="Edificio"><select aria-label="Edificio" value={values.building} onChange={(event) => setValues({ ...values, building: event.target.value })}>{BUILDINGS.map((building) => <option key={building}>{building}</option>)}</select></Field><Field label="Ubicación"><input required maxLength={120} placeholder="Ej. Pasillo norte, segundo piso" value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></Field><Field label="Prioridad"><select aria-label="Prioridad" value={values.priority} onChange={(event) => setValues({ ...values, priority: event.target.value })}>{Object.entries(priorityLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field></div><Field label="Habitación (opcional)"><select value={values.roomId || ''} onChange={(event) => { const room = rooms.find((item) => item.id === event.target.value); setValues({ ...values, roomId: event.target.value, ...(room ? { building: room.building, location: `Habitación ${room.number}` } : {}) }); }}><option value="">Área común / sin habitación</option>{rooms.map((room) => <option key={room.id} value={room.id}>Habitación {room.number}</option>)}</select></Field><Field label="Síntoma para detectar trabajos duplicados"><input value={values.faultDetail || ''} onChange={(event) => setValues({ ...values, faultDetail: event.target.value })} maxLength={200} placeholder="Si se omite, se usa la descripción completa" /></Field><Field label="Descripción del hallazgo"><textarea required rows={4} maxLength={3000} placeholder="¿Qué encontraste y qué necesita atención?" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></Field><PhotoInput photos={values.photos || []} onChange={(photos) => setValues((old) => ({ ...old, photos }))} /><p className="muted">Puedes tomar fotos desde la cámara del teléfono o adjuntar imágenes existentes.</p></div><div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">Guardar hallazgo</button></div></form></Modal>;
}

export default function Inspections({ data, setData, notify, mode = 'rooms', currentUser, user }) {
  const profile = currentUser || user;
  const [search, setSearch] = useState('');
  const [building, setBuilding] = useState('all');
  const [editor, setEditor] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyRoom, setHistoryRoom] = useState('all');
  const [roundEditor, setRoundEditor] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [roundToConvert, setRoundToConvert] = useState(null);
  const [roundDuplicateAction, setRoundDuplicateAction] = useState('link');
  const rooms = data.rooms || [];
  const rounds = data.rounds || [];
  const roomHistory = data.roomHistory || [];
  const filteredRooms = useMemo(() => rooms.filter((room) => (building === 'all' || room.building === building) && `${room.number} ${room.building}`.toLowerCase().includes(search.toLowerCase().trim())), [rooms, building, search]);
  const filteredHistory = roomHistory.filter((item) => historyRoom === 'all' || item.roomId === historyRoom);
  const filteredRounds = rounds.filter((round) => (building === 'all' || round.building === building) && `${round.location} ${round.description}`.toLowerCase().includes(search.toLowerCase().trim()));
  const completeRooms = rooms.filter((room) => room.lastInspectionAt).length;
  const roomFindings = roomHistory.reduce((total, item) => total + item.checks.filter((check) => check.status === 'finding').length, 0);
  const saveRoom = (values, finalize) => {
    const date = new Date().toISOString();
    const historyId = uid('360');
    const baseRecord = { id: historyId, roomId: values.id, roomNumber: values.number, building: values.building, areaM2: values.areaM2, date, checks: values.checks, photos: values.photos, reference: CHECKLIST_REFERENCE, ...actor(profile) };
    setData((old) => {
      let orders = [...(old.orders || [])];
      const links = [];
      if (finalize) for (const check of values.checks.filter((item) => item.status === 'finding' && item.significant)) {
        const candidate = roomOrder({ room: values, check, historyId, user: profile });
        const duplicate = findOpenDuplicate(orders, candidate);
        const finding = { id: uid('HALL'), ...actor(profile), at: date, title: check.label, description: check.note, photos: values.photos, source: '360', sourceId: historyId, reference: CHECKLIST_REFERENCE };
        if (duplicate && check.duplicateAction !== 'new') {
          orders = orders.map((order) => order.id === duplicate.id ? { ...order, findings: [...(order.findings || []), finding] } : order);
          links.push({ orderId: duplicate.id, findingId: finding.id, action: 'linked' });
        } else {
          orders.unshift({ ...candidate, findings: [{ ...finding, initial: true }], ...(duplicate ? { duplicateOf: duplicate.id, duplicateWarningAcceptedBy: profile?.id || '', duplicateWarningAt: date } : {}) });
          links.push({ orderId: candidate.id, findingId: finding.id, action: 'created' });
        }
      }
      const record = { ...baseRecord, orderIds: [...new Set(links.map((link) => link.orderId))], orderLinks: links };
      return { ...old, rooms: old.rooms.map((room) => room.id === values.id ? { ...values, draft: !finalize, updatedAt: date, updatedBy: profile?.id || '', lastInspectionAt: finalize ? date : room.lastInspectionAt } : room), roomHistory: finalize ? [record, ...(old.roomHistory || [])] : old.roomHistory, orders };
    });
    setEditor(null); notify(finalize ? 'Revisión finalizada. Hallazgos significativos creados o vinculados al correctivo.' : 'Borrador de habitación guardado.');
  };
  const saveRound = (values) => {
    const saved = { ...values, id: values.id || uid('REC'), createdAt: values.createdAt || new Date().toISOString(), orderId: values.orderId || null, ...(values.id ? {} : actor(profile)), updatedBy: profile?.id || '', updatedAt: new Date().toISOString() };
    setData((old) => ({ ...old, rounds: values.id ? old.rounds.map((round) => round.id === values.id ? saved : round) : [saved, ...(old.rounds || [])] }));
    setRoundEditor(null); notify('Hallazgo de recorrida guardado.');
  };
  const roundCandidate = (round) => ({ building: round.building, roomId: round.roomId || '', location: round.location, fault: 'Hallazgo de recorrida', faultDetail: round.faultDetail?.trim() || round.description?.trim() });
  const createRoundOrder = (round) => {
    if (round.orderId) return;
    const owner = TEAM.find((member) => member.area === 'Infraestructura') || TEAM[0];
    const at = new Date().toISOString();
    const order = { id: uid('OT'), title: `Recorrida · ${round.location}`, description: round.description, area: owner?.area || 'Infraestructura', ...roundCandidate(round), owner: owner?.id || '', priority: round.priority, status: 'pending', progress: 0, createdAt: at, startedAt: null, closedAt: null, source: 'rounds', roundId: round.id, createdBy: profile?.id || '', createdByName: profile?.name || 'Autor no registrado', reports: [] };
    const finding = { id: uid('HALL'), ...actor(profile), at, title: `Recorrida · ${round.location}`, description: round.description, photos: round.photos || [], source: 'rounds', sourceId: round.id };
    setData((old) => {
      if (old.rounds.find((item) => item.id === round.id)?.orderId) return old;
      const duplicate = findOpenDuplicate(old.orders || [], order);
      const linked = duplicate && roundDuplicateAction !== 'new';
      const orderId = linked ? duplicate.id : order.id;
      const orders = linked ? old.orders.map((item) => item.id === orderId ? { ...item, findings: [...(item.findings || []), finding] } : item) : [{ ...order, findings: [{ ...finding, initial: true }], ...(duplicate ? { duplicateOf: duplicate.id, duplicateWarningAcceptedBy: profile?.id || '', duplicateWarningAt: at } : {}) }, ...(old.orders || [])];
      return { ...old, orders, rounds: old.rounds.map((item) => item.id === round.id ? { ...item, orderId, linkedFindingId: finding.id, orderAction: linked ? 'linked' : 'created' } : item) };
    });
    setRoundToConvert(null); notify('Hallazgo vinculado al plan correctivo con su autor y fotografías.');
  };
  const exportRooms = () => {
    const evidence = roomHistory.flatMap((record) => (record.photos || []).map((photo) => ({ ...photo, name: `${record.id} · Hab. ${record.roomNumber} · ${record.authorName || 'Autor anterior'} · ${photo.name}` })));
    const draftEvidence = rooms.filter((room) => room.draft).flatMap((room) => (room.photos || []).map((photo) => ({ ...photo, name: `Borrador Hab. ${room.number} · ${photo.name}` })));
    return exportWorkbook('sigma-ing-habitaciones-360', [
      { name: 'Habitaciones', rows: rooms.map((room) => ({ ID: room.id, Habitación: room.number, Edificio: room.building, 'Superficie m²': room.areaM2, 'Última revisión': room.lastInspectionAt || '', Borrador: room.draft ? 'Sí' : 'No', 'Puntos revisados': countReviewed(room.checks) })) },
      { name: 'Historial 360', rows: roomHistory.flatMap((record) => record.checks.map((check) => ({ Revisión: record.id, Fecha: record.date, Autor: record.authorName || 'No registrado', Habitación: record.roomNumber, Edificio: record.building, Punto: check.label, Referencia: check.reference || record.reference || 'Plantilla anterior', Resultado: statusLabel[check.status], Observación: check.note, Síntoma: check.faultDetail || check.note || '', Significativo: check.significant ? 'Sí' : 'No', Prioridad: check.status === 'finding' ? priorityLabel[check.priority] : '', Correctivos: (record.orderIds || []).join(', '), Fotos: (record.photos || []).length }))) },
      { name: 'Vínculos correctivos', rows: roomHistory.flatMap((record) => (record.orderLinks || []).map((link) => ({ Revisión: record.id, Autor: record.authorName, Solicitud: link.orderId, Hallazgo: link.findingId, Acción: link.action === 'linked' ? 'Vinculado a trabajo existente' : 'Trabajo creado' }))) },
      { name: 'Evidencias 360', rows: [...evidence, ...draftEvidence].map((photo) => ({ Evidencia: photo.name })), images: [...evidence, ...draftEvidence] },
    ]);
  };
  const exportRounds = () => {
    const evidence = filteredRounds.flatMap((round) => (round.photos || []).map((photo) => ({ ...photo, name: `${round.id} · ${round.location} · ${round.authorName || 'Autor anterior'} · ${photo.name}` })));
    return exportWorkbook('sigma-ing-recorridas', [
      { name: 'Recorridas', rows: filteredRounds.map((round) => ({ ID: round.id, Fecha: round.date, Autor: round.authorName || 'No registrado', Edificio: round.building, Habitación: round.roomId || '', Ubicación: round.location, Descripción: round.description, Síntoma: round.faultDetail || round.description, Prioridad: priorityLabel[round.priority], Correctivo: round.orderId || '', Fotos: (round.photos || []).length })) },
      { name: 'Evidencias de recorridas', rows: evidence.map((photo) => ({ Evidencia: photo.name })), images: evidence },
    ]);
  };

  if (mode === 'rounds') return <div className="inspections-module">
    <div className="module-heading no-print"><div><h2>Recorridas que se convierten en acciones</h2><p>Una foto, una ubicación y una descripción. Así de sencillo.</p></div><div className="inline-actions"><button className="button secondary" onClick={exportRounds} disabled={!filteredRounds.length}><Download size={16} />Excel</button><button className="button primary" onClick={() => setRoundEditor({})}><Plus size={17} />Nueva recorrida</button></div></div>
    <div className="metric-grid no-print"><div className="metric-card"><span>Hallazgos registrados</span><strong>{rounds.length}</strong></div><div className="metric-card"><span>Con trabajo correctivo</span><strong>{rounds.filter((round) => round.orderId).length}</strong></div><div className="metric-card"><span>Evidencias fotográficas</span><strong>{rounds.reduce((total, round) => total + (round.photos || []).length, 0)}</strong></div></div>
    <div className="toolbar no-print"><label className="search-field"><Search size={17} /><input aria-label="Buscar recorridas" placeholder="Buscar ubicación o descripción…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrar edificio de recorridas" value={building} onChange={(event) => setBuilding(event.target.value)}><option value="all">Todos los edificios</option>{BUILDINGS.map((value) => <option key={value}>{value}</option>)}</select><button className="button secondary" onClick={() => { setPrintMode(true); setTimeout(() => { window.print(); setPrintMode(false); }, 100); }} disabled={!filteredRounds.length}><Printer size={16} />Informe / PDF</button></div>
    <section className={`print-report ${printMode ? 'printing' : ''}`}><div className="print-report-heading"><h2>Informe de recorridas · Ingeniería</h2><p>{formatDate(todayISO())} · {filteredRounds.length} hallazgos · {building === 'all' ? 'Todos los edificios' : building}</p></div><div className="module-grid rounds-grid">{filteredRounds.map((round) => <article className="card round-card" key={round.id}><div className="summary-row"><span className="badge">{round.id}</span><span className={`badge ${round.priority}`}>Prioridad {priorityLabel[round.priority]}</span></div><h3><MapPin size={17} />{round.location}</h3><p className="muted">{round.building} · {formatDate(round.date)} · {round.authorName || 'Autor anterior no registrado'}</p><p className="round-description">{round.description}</p><div className="photo-grid">{(round.photos || []).map((photo) => <figure className="photo-item" key={photo.id}><a href={photo.url} download={photo.name || 'evidencia.jpg'}><img src={photo.url} alt={photo.name || `Hallazgo en ${round.location}`} /></a><figcaption>{photo.name}</figcaption></figure>)}</div><div className="inline-actions no-print">{round.orderId ? <span className="badge success"><CheckCircle2 size={14} />Correctivo {round.orderId}</span> : <button className="button secondary small" onClick={() => { setRoundDuplicateAction('link'); setRoundToConvert(round); }}><Wrench size={15} />Crear correctivo</button>}<button className="button secondary small" onClick={() => setRoundEditor(round)}>Editar hallazgo</button></div></article>)}</div></section>
    {!filteredRounds.length && <div className="empty-state"><Camera size={32} /><h3>{rounds.length ? 'No hay resultados para este filtro' : 'Tu próxima recorrida empieza aquí'}</h3><p>Registra una foto, indica la ubicación y describe lo que encontraste.</p><button className="button primary" onClick={() => setRoundEditor({})}>Registrar hallazgo</button></div>}
    <p className="muted no-print">Excel incluye los datos, autores y fotografías incrustadas en una hoja de evidencias. El informe imprimible muestra las imágenes; selecciona «Guardar como PDF» en la impresión del navegador.</p>
    {roundToConvert && <Modal title="Vincular hallazgo al correctivo" onClose={() => setRoundToConvert(null)}><p>{roundToConvert.location} · {roundToConvert.faultDetail || roundToConvert.description}</p><DuplicateChoice duplicate={findOpenDuplicate(data.orders || [], roundCandidate(roundToConvert))} value={roundDuplicateAction} onChange={setRoundDuplicateAction} /><p className="muted">La evidencia fotográfica y el autor quedarán registrados en el historial del trabajo.</p><div className="modal-footer"><button className="button secondary" onClick={() => setRoundToConvert(null)}>Cancelar</button><button className="button primary" onClick={() => createRoundOrder(roundToConvert)}>{findOpenDuplicate(data.orders || [], roundCandidate(roundToConvert)) && roundDuplicateAction !== 'new' ? 'Vincular al trabajo existente' : 'Crear trabajo correctivo'}</button></div></Modal>}
    {roundEditor && <RoundEditor rooms={rooms} round={roundEditor.id ? roundEditor : null} onSave={saveRound} onClose={() => setRoundEditor(null)} />}
  </div>;

  return <div className="inspections-module">
    <div className="module-heading"><div><h2>Control de mantenimiento 360</h2><p>123 habitaciones. Un recorrido completo, de derecha a izquierda.</p></div><div className="inline-actions"><button className="button secondary" onClick={exportRooms}><Download size={16} />Exportar Excel</button><button className="button secondary" onClick={() => setShowHistory(!showHistory)}><History size={16} />{showHistory ? 'Ver habitaciones' : 'Historial de revisiones'}</button></div></div>
    <div className="metric-grid"><div className="metric-card"><span>Habitaciones registradas</span><strong>{rooms.length}</strong><small>Números editables al revisar</small></div><div className="metric-card"><span>Con revisión finalizada</span><strong>{completeRooms}</strong><small>{rooms.length ? Math.round(completeRooms / rooms.length * 100) : 0}% de cobertura histórica</small></div><div className="metric-card"><span>Revisiones históricas</span><strong>{roomHistory.length}</strong><small>Sin borrado automático</small></div><div className="metric-card"><span>Hallazgos registrados</span><strong>{roomFindings}</strong><small>Acumulado de todas las revisiones</small></div></div>
    <div className="notice"><Hotel size={21} /><p>Los números 001–123 son provisionales. Puedes cambiarlos por los números reales, asignar edificio y registrar los m². El historial se conserva en este navegador; no sustituye una base de datos con respaldo anual.</p></div>
    {showHistory ? <section className="card"><div className="toolbar"><h3>Historial de casos 360</h3><select aria-label="Filtrar historial por habitación" value={historyRoom} onChange={(event) => setHistoryRoom(event.target.value)}><option value="all">Todas las habitaciones</option>{rooms.map((room) => <option key={room.id} value={room.id}>Habitación {room.number}</option>)}</select></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Revisión</th><th>Habitación</th><th>Fecha</th><th>Hallazgos</th><th>Correctivos</th><th>Detalle</th></tr></thead><tbody>{filteredHistory.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.roomNumber} · {item.building}</td><td>{formatDate(item.date)}</td><td>{item.checks.filter((check) => check.status === 'finding').length}</td><td>{(item.orderIds || []).length}</td><td><button className="button secondary small" onClick={() => setHistory(item)}>Ver revisión</button></td></tr>)}</tbody></table></div>{!filteredHistory.length && <div className="empty-state"><History size={28} /><h3>Aún no hay revisiones finalizadas</h3><p>Los borradores se guardan en cada habitación. Al finalizar, la revisión se añade aquí sin eliminar las anteriores.</p></div>}</section> : <>
      <div className="toolbar"><label className="search-field"><Search size={17} /><input aria-label="Buscar habitación" placeholder="Buscar número de habitación…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrar edificio de habitaciones" value={building} onChange={(event) => setBuilding(event.target.value)}><option value="all">Todos los edificios</option>{BUILDINGS.map((value) => <option key={value}>{value}</option>)}</select><span className="muted">{filteredRooms.length} habitaciones</span></div>
      <div className="room-grid">{filteredRooms.map((room) => <button className={`room-tile ${room.draft ? 'draft' : room.lastInspectionAt ? 'reviewed' : ''}`} key={room.id} onClick={() => setEditor(room)} aria-label={`Revisar habitación ${room.number}`}><Hotel size={21} /><strong>{room.number}</strong><span>{room.building}</span><small>{room.draft ? `Borrador · ${countReviewed(room.checks)}/${roomChecks.length}` : room.lastInspectionAt ? 'Revisión registrada' : 'Por revisar'}</small></button>)}</div>
      {!filteredRooms.length && <div className="empty-state"><Search size={28} /><h3>No encontramos esa habitación</h3><button className="button secondary" onClick={() => { setSearch(''); setBuilding('all'); }}>Limpiar filtros</button></div>}
    </>}
    {editor && <RoomEditor room={editor} rooms={rooms} orders={data.orders || []} onSave={saveRoom} onClose={() => setEditor(null)} notify={notify} />}
    {history && <InspectionHistory item={history} onClose={() => setHistory(null)} />}
  </div>;
}
