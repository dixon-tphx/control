import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Download, FolderOpen, Plus, Search, Wrench, Camera, UserRound, Link2 } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TEAM, AREAS, BUILDINGS, Modal, Field, exportWorkbook, uid, todayISO, formatDate, PhotoInput } from '../shared';
import { findOpenDuplicate, faultIdentity } from '../domain';

const STATUS = { pending: 'Pendiente', progress: 'En proceso', completed: 'Cerrada' };
const PRIORITY = { high: 'Alta', medium: 'Media', low: 'Baja' };
const FAULTS = ['Fuga de agua', 'Aire acondicionado', 'Electricidad', 'Cerradura', 'Otro'];
const STATUS_COLORS = ['#edb254', '#5367ed', '#39a884'];
const SOURCES = { request: 'Solicitud', preventive: 'Hallazgo preventivo', '360': 'Habitación 360', rounds: 'Recorrida', corrective: 'Plan correctivo' };
const normalize = (text = '') => text.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
const hoursBetween = (start, end) => Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3600000);
const memberName = (id) => TEAM.find((member) => member.id === id)?.name || 'Sin asignar';
const memberForArea = (area) => TEAM.find((member) => member.area === area)?.id || '';
const isoAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const canonicalRoomId = (id) => id && /^H?\d{1,3}$/i.test(String(id)) ? `H${String(id).replace(/^H/i, '').padStart(3, '0')}` : id;
const roomName = (id, rooms = []) => rooms.find((room) => room.id === canonicalRoomId(id))?.number || String(id).replace(/^H(?=\d)/i, '');
const faultLocation = (group, rooms) => group.roomId ? `habitación ${roomName(group.roomId, rooms)}` : group.location;

export function seedOrders() {
  const firstArea = AREAS.includes('Infraestructura') ? 'Infraestructura' : AREAS[0];
  const secondArea = AREAS.includes('Electromecánica') ? 'Electromecánica' : AREAS[1] || firstArea;
  const building = BUILDINGS[0];
  return [
    { id: 'OT-001', title: 'Corregir fuga en lavamanos', area: firstArea, building, roomId: '014', location: '', fault: 'Fuga de agua', faultDetail: 'Fuga en válvula del lavamanos', priority: 'high', status: 'progress', progress: 65, createdAt: isoAgo(16), startedAt: isoAgo(14), closedAt: null, source: 'request', description: 'Reincidencia en la válvula del lavamanos. Revisar la causa raíz y verificar estanqueidad.', plannedHours: 6 },
    { id: 'OT-002', title: 'Inspección de fuga recurrente', area: firstArea, building, roomId: '014', location: '', fault: 'Fuga de agua', faultDetail: 'Fuga en válvula del lavamanos', priority: 'high', status: 'completed', progress: 100, createdAt: isoAgo(260), startedAt: isoAgo(258), closedAt: isoAgo(254), source: '360', description: 'Hallazgo durante revisión 360; se realizó ajuste de conexión.', plannedHours: 6 },
    { id: 'OT-003', title: 'Ajuste de válvula de lavamanos', area: firstArea, building, roomId: '014', location: '', fault: 'Fuga de agua', faultDetail: 'Fuga en válvula del lavamanos', priority: 'medium', status: 'completed', progress: 100, createdAt: isoAgo(480), startedAt: isoAgo(478), closedAt: isoAgo(476), source: 'corrective', description: 'Revisión de sellos y ajuste de la válvula. Registro histórico de ejemplo.', plannedHours: 4 },
    { id: 'OT-004', title: 'Revisar goteo reportado', area: firstArea, building, roomId: '014', location: '', fault: 'Fuga de agua', faultDetail: 'Fuga en válvula del lavamanos', priority: 'high', status: 'pending', progress: 0, createdAt: isoAgo(4), startedAt: null, closedAt: null, source: 'request', description: 'Cuarto reporte del mismo síntoma; evaluar sustitución de la válvula.', plannedHours: 4 },
    { id: 'OT-005', title: 'Sustituir contactor de bomba de piscina', area: secondArea, building, roomId: '', location: 'Cuarto de bombas de piscina', fault: 'Electricidad', faultDetail: 'Contactor con calentamiento', priority: 'high', status: 'progress', progress: 40, createdAt: isoAgo(32), startedAt: isoAgo(28), closedAt: null, source: 'preventive', description: 'Hallazgo significativo del preventivo: verificar y sustituir contactor según diagnóstico técnico.', plannedHours: 8 },
    { id: 'OT-006', title: 'Revisar unidad de aire acondicionado', area: secondArea, building: BUILDINGS[1] || building, roomId: '087', location: '', fault: 'Aire acondicionado', faultDetail: 'Baja capacidad de enfriamiento', priority: 'medium', status: 'pending', progress: 0, createdAt: isoAgo(8), startedAt: null, closedAt: null, source: 'request', description: 'Verificar temperatura, limpieza y funcionamiento de la unidad.', plannedHours: 5 },
    { id: 'OT-007', title: 'Ajustar brazo cierrapuertas', area: firstArea, building, roomId: '023', location: '', fault: 'Cerradura', faultDetail: 'Puerta no cierra desde 45 grados', priority: 'high', status: 'progress', progress: 80, createdAt: isoAgo(24), startedAt: isoAgo(21), closedAt: null, source: '360', description: 'La puerta no cierra por sí sola desde 45°. Corregir y probar cierre completo.', plannedHours: 3 },
    { id: 'OT-008', title: 'Reparar acabado en corredor', area: firstArea, building: BUILDINGS[1] || building, roomId: '', location: 'Corredor segundo nivel', fault: 'Otro', faultDetail: 'Desprendimiento de pintura', priority: 'low', status: 'pending', progress: 0, createdAt: isoAgo(40), startedAt: null, closedAt: null, source: 'rounds', description: 'Hallazgo de recorrido. Preparar superficie y reparar acabado.', plannedHours: 8 },
  ].map((item) => ({ ...item, roomId: canonicalRoomId(item.roomId), owner: memberForArea(item.area), createdBy: 'demo-requester', createdByName: 'Recepción demo', demo: true, reports: [], findings: [], updates: [{ at: item.createdAt, progress: 0, note: 'Solicitud registrada · datos de ejemplo', authorId: 'demo-coordinator', authorName: 'Coordinación demo', authorRole: 'coordinator', demo: true }] }));
}

export function getRecurringFaults(orders) {
  const groups = new Map();
  for (const order of orders) {
    const symptom = normalize(order.faultDetail || order.fault);
    const location = order.roomId ? `habitación ${String(canonicalRoomId(order.roomId)).replace(/^H(?=\d)/i, '')}` : normalize(order.location || '');
    if (!symptom || !location || !order.building) continue;
    const key = faultIdentity(order);
    if (!key) continue;
    const old = groups.get(key) || { key, title: order.faultDetail || order.fault, building: order.building, roomId: canonicalRoomId(order.roomId || ''), location, count: 0, orders: [] };
    old.count += 1 + new Set((order.findings || []).filter((finding) => !finding.initial).map((finding, index) => finding.id || `legacy-${index}`)).size; old.orders.push(order.id); groups.set(key, old);
  }
  return [...groups.values()].filter((group) => group.count > 3).sort((a, b) => b.count - a.count);
}

const LEGACY_USER = { id: 'demo-admin', name: 'Administración demo', role: 'admin', demo: true };
const ROLE_NAMES = { requester: 'Solicitante', technician: 'Técnico', coordinator: 'Coordinación', admin: 'Administración' };
const actorLabel = (record) => record.authorName || 'Autor no identificado en registro anterior';
const safePhotos = (photos) => (photos || []).filter((photo) => photo?.url && /^(data:image\/(?:jpeg|png|webp);base64,|https?:\/\/|blob:)/i.test(photo.url));
const actorStamp = (user) => ({ authorId: user.id, authorName: user.name || 'Usuario', authorRole: user.role, ...(user.demo || user.isDemo ? { demo: true } : {}) });

function blankOrder(mode, user) {
  const area = AREAS.includes(user.area) ? user.area : AREAS[0];
  return { title: '', description: '', area, building: BUILDINGS[0], roomId: '', location: '', owner: '', priority: 'medium', status: 'pending', progress: 0, fault: FAULTS[0], faultDetail: '', source: mode === 'corrective' ? 'corrective' : 'request', plannedHours: 4, photos: [] };
}

function ReadonlyPhotos({ photos = [] }) {
  const [selected, setSelected] = useState(null);
  const items = safePhotos(photos);
  if (!items.length) return null;
  return <div><div className="photo-grid">{items.map((photo, index) => <button type="button" className="photo-preview" key={photo.id || `${photo.name}-${index}`} onClick={() => setSelected(selected === index ? null : index)} aria-label={`Ver evidencia ${photo.name || index + 1}`}><img src={photo.url} alt={photo.name || 'Fotografía de evidencia'} loading="lazy" /></button>)}</div>{selected != null && items[selected] && <div style={{ marginTop: 12 }}><img style={{ display: 'block', width: '100%', maxHeight: 500, objectFit: 'contain', borderRadius: 12 }} src={items[selected].url} alt={items[selected].name || 'Evidencia ampliada'} /><button type="button" className="button ghost small" onClick={() => setSelected(null)}>Cerrar ampliación</button></div>}</div>;
}

function TechnicalReports({ order }) {
  const reports = order.reports || [];
  return <section style={{ marginTop: 24 }}><h3>Reportes técnicos y evidencia</h3>{reports.length ? [...reports].reverse().map((report, index) => <article className="card" style={{ padding: 16, marginBottom: 12 }} key={report.id || index}><div className="summary-row"><strong>{actorLabel(report)}</strong><span className="badge">{ROLE_NAMES[report.authorRole] || 'Rol no registrado'}</span><span className={`badge ${report.status === 'completed' ? 'success' : ''}`}>{STATUS[report.status] || report.status} · {report.progress}%</span></div><small className="muted">{formatDate(report.at)}{report.demo ? ' · Registro de demostración' : ''}</small><p style={{ whiteSpace: 'pre-wrap' }}>{report.notes}</p><ReadonlyPhotos photos={report.photos} /></article>) : <p className="notice">Todavía no hay un reporte técnico firmado. Los registros anteriores del avance se conservan por separado.</p>}</section>;
}

function OrderFolder({ order, rooms, user, onClose, onEdit, onReport, onExport }) {
  const manager = ['admin', 'coordinator'].includes(user.role);
  const canReport = manager || user.role === 'technician' && !!user.memberId && order.owner === user.memberId;
  return <Modal title={`Carpeta de trabajo · ${order.id}`} onClose={onClose} wide>
    <div className="summary-row"><span className={`badge ${order.status === 'completed' ? 'success' : 'medium'}`}>{STATUS[order.status]}</span><span className={`badge ${order.priority}`}>Prioridad {PRIORITY[order.priority]?.toLowerCase()}</span><strong>{order.progress || 0}% de avance</strong></div>
    <h3>{order.title}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{order.description || 'Sin descripción adicional.'}</p>
    <div className="form-grid"><div className="field"><span>Responsable / área</span><strong>{memberName(order.owner)}</strong><small>{order.area}</small></div><div className="field"><span>Ubicación</span><strong>{order.building} · {order.roomId ? `Habitación ${roomName(order.roomId, rooms)}` : order.location || 'No especificada'}</strong></div><div className="field"><span>Solicitante</span><strong>{order.createdByName || 'No registrado en dato anterior'}</strong><small>{formatDate(order.createdAt)}</small></div><div className="field"><span>Avería específica</span><strong>{order.faultDetail || order.fault}</strong><small>{SOURCES[order.source] || order.source}</small></div></div>
    <div className="progress-track"><span className="progress-fill" style={{ width: `${order.progress || 0}%` }} /></div>
    {order.closedAt && <p className="notice">Cierre: {formatDate(order.closedAt)} · Resolución: {hoursBetween(order.createdAt, order.closedAt).toFixed(1)} horas transcurridas.</p>}
    <ReadonlyPhotos photos={order.photos} />
    {user.role === 'requester' && <p className="notice">Puedes consultar el avance y la evidencia. Coordinación asigna el trabajo; el personal técnico registra la ejecución.</p>}
    <div className="inline-actions" style={{ marginTop: 16 }}>{canReport && <button className="button primary" onClick={onReport}><Camera size={16} />Registrar reporte técnico</button>}{manager && <button className="button secondary" onClick={onEdit}>Editar asignación y detalles</button>}<button className="button secondary" onClick={onExport}><Download size={16} />Excel de esta carpeta</button></div>
    <TechnicalReports order={order} />
    {!!order.findings?.length && <section style={{ marginTop: 24 }}><h3>Hallazgos vinculados a esta solicitud</h3>{[...order.findings].reverse().map((finding, index) => <article className="card" style={{ padding: 16, marginBottom: 12 }} key={finding.id || index}><div className="summary-row"><strong>{finding.title || 'Hallazgo adicional'}</strong><small>{actorLabel(finding)} · {formatDate(finding.at)}</small></div><p style={{ whiteSpace: 'pre-wrap' }}>{finding.description}</p><ReadonlyPhotos photos={finding.photos} /></article>)}</section>}
    {!!order.updates?.length && <section style={{ marginTop: 24 }}><h3>Historial de la carpeta</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Autor</th><th>Avance</th><th>Registro</th></tr></thead><tbody>{[...order.updates].reverse().map((update, index) => <tr key={`${update.at}-${index}`}><td>{formatDate(update.at)}</td><td>{actorLabel(update)}{update.authorRole && <small style={{ display: 'block' }}>{ROLE_NAMES[update.authorRole] || update.authorRole}</small>}</td><td>{update.progress}%</td><td>{update.note}</td></tr>)}</tbody></table></div></section>}
    <div className="modal-footer"><button className="button secondary" onClick={onClose}>Cerrar carpeta</button></div>
  </Modal>;
}

function ReportEditor({ order, user, onClose, onSubmit }) {
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState(order.status || 'pending');
  const [progress, setProgress] = useState(Number(order.progress || 0));
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (event.currentTarget.querySelector('input[type="file"]:disabled')) { setError('Espera a que termine de procesarse la fotografía.'); return; }
    if (notes.trim().length < 3) { setError('Describe el trabajo ejecutado con al menos 3 caracteres.'); return; }
    const now = new Date().toISOString();
    onSubmit({ id: uid('REP'), ...actorStamp(user), at: now, notes: notes.trim(), status, progress: status === 'completed' ? 100 : Math.min(99, Math.max(0, Number(progress))), photos });
  };
  return <Modal title={`Reporte técnico · ${order.id}`} onClose={onClose} wide><form onSubmit={submit}>
    <p className="notice">{order.title} · {memberName(order.owner)}. Este reporte registra la ejecución y su autor; no cambia la asignación ni los datos de la solicitud.</p>
    <div className="summary-row"><span><UserRound size={15} style={{ verticalAlign: 'middle' }} /> {user.name || 'Usuario'}</span><span className="badge">{ROLE_NAMES[user.role]}</span></div>
    <Field label="Trabajo realizado / reporte técnico"><textarea required minLength={3} maxLength={4000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Describe acciones realizadas, materiales, diagnóstico y verificación." /></Field>
    <div className="form-grid"><Field label="Estado del trabajo"><select value={status} onChange={(event) => { const next = event.target.value; setStatus(next); setProgress(next === 'completed' ? 100 : next === 'pending' ? 0 : Math.max(5, Math.min(99, progress))); }}>{Object.entries(STATUS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label={`Porcentaje de avance · ${progress}%`}><input type="range" aria-label="Porcentaje del reporte" min="0" max="100" step="5" value={progress} onChange={(event) => { const value = Number(event.target.value); setProgress(value); setStatus(value === 100 ? 'completed' : value > 0 ? 'progress' : 'pending'); }} /></Field></div>
    <h3>Fotografías de evidencia</h3><PhotoInput photos={photos} onChange={setPhotos} />
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button primary"><CheckCircle2 size={16} />Guardar reporte técnico</button></div>
  </form></Modal>;
}

function OrderEditor({ order, mode, rooms = [], user, orders, onSave, onLink, onClose }) {
  const manager = ['admin', 'coordinator'].includes(user.role);
  const [form, setForm] = useState({ ...blankOrder(mode, user), ...order, roomId: canonicalRoomId(order.roomId || ''), description: order.description || '', progress: Number(order.progress || 0), faultDetail: order.faultDetail || '', location: order.location || '', plannedHours: order.plannedHours || 4, photos: order.photos || [] });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [createAnyway, setCreateAnyway] = useState(false);
  const people = TEAM.filter((member) => member.area === form.area);
  const change = (key) => (event) => { setCreateAnyway(false); setForm((old) => ({ ...old, [key]: event.target.value })); };
  const duplicate = !order.id && form.faultDetail.trim().length >= 3 ? findOpenDuplicate(orders, form) : null;
  const validate = () => {
    if (form.title.trim().length < 3 || form.faultDetail.trim().length < 3) return 'Escribe un título y una descripción de la avería de al menos 3 caracteres.';
    if (!form.roomId && !form.location.trim()) return 'Selecciona una habitación o escribe la ubicación exacta.';
    if (manager && form.owner && !people.some((member) => member.id === form.owner)) return 'Asigna un responsable del área seleccionada o deja pendiente de asignación.';
    if (manager && (!Number.isFinite(Number(form.plannedHours)) || Number(form.plannedHours) <= 0)) return 'La duración prevista debe ser mayor que cero.';
    return '';
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    if (event.currentTarget.querySelector('input[type="file"]:disabled')) { setError('Espera a que termine de procesarse la fotografía.'); return; }
    const message = validate(); if (message) { setError(message); return; }
    if (duplicate && !createAnyway) { setError('Existe un trabajo abierto de la misma avería y ubicación. Vincula el hallazgo o confirma que necesitas una solicitud independiente.'); return; }
    const now = new Date().toISOString();
    const completed = manager && form.status === 'completed';
    const progress = manager ? completed ? 100 : Math.min(99, Math.max(0, Number(form.progress))) : 0;
    const saved = {
      ...form, id: form.id || uid('OT'), title: form.title.trim(), description: form.description.trim(), faultDetail: form.faultDetail.trim(), location: form.location.trim(),
      owner: manager ? form.owner : '', status: manager ? form.status : 'pending', plannedHours: Number(form.plannedHours), progress,
      createdAt: form.createdAt || now, createdBy: form.createdBy || user.id, createdByName: form.createdByName || user.name || 'Usuario',
      startedAt: manager ? form.startedAt || (form.status !== 'pending' ? now : null) : null, closedAt: completed ? form.closedAt || now : null,
      reports: form.reports || [], findings: form.findings || [],
      updates: [...(form.updates || []), { at: now, progress, note: note.trim() || (form.id ? 'Coordinación actualizó asignación y detalles' : 'Solicitud registrada'), ...actorStamp(user) }],
    };
    onSave(saved);
  };
  const link = (event) => {
    if (event.currentTarget.closest('form')?.querySelector('input[type="file"]:disabled')) { setError('Espera a que termine de procesarse la fotografía.'); return; }
    const message = validate(); if (message) { setError(message); return; }
    if (!duplicate) return;
    onLink(duplicate.id, { id: uid('HAL'), ...actorStamp(user), at: new Date().toISOString(), title: form.title.trim(), description: form.description.trim() || form.faultDetail.trim(), photos: form.photos });
  };
  return <Modal title={form.id ? `Asignación y detalles · ${form.id}` : mode === 'corrective' ? 'Nuevo trabajo correctivo' : 'Nueva solicitud de trabajo'} onClose={onClose} wide><form onSubmit={handleSubmit}>
    {!manager && <p className="notice">Cualquier integrante puede solicitar un trabajo. Coordinación revisará el área, asignará al personal y dará seguimiento.</p>}
    <div className="form-grid">
      <Field label="Solicitud / trabajo"><input required minLength={3} maxLength={160} value={form.title} onChange={change('title')} placeholder="Describe el trabajo a realizar" /></Field>
      <Field label={manager ? 'Área responsable' : 'Área sugerida'}><select value={form.area} onChange={(event) => { const area = event.target.value; setCreateAnyway(false); setForm((old) => ({ ...old, area, owner: '' })); }}>{AREAS.map((area) => <option key={area}>{area}</option>)}</select></Field>
      {manager && <Field label="Responsable del área"><select value={form.owner} onChange={change('owner')}><option value="">Pendiente de asignación</option>{people.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>}
      <Field label="Edificio"><select value={form.building} onChange={(event) => { const building = event.target.value; const assignedRoom = rooms.find((room) => room.id === form.roomId); setCreateAnyway(false); setForm((old) => ({ ...old, building, roomId: assignedRoom && assignedRoom.building !== building ? '' : old.roomId })); }}>{BUILDINGS.map((building) => <option key={building}>{building}</option>)}</select></Field>
      <Field label="Habitación (si corresponde)"><select value={form.roomId} onChange={(event) => { const roomId = event.target.value; const room = rooms.find((room) => room.id === roomId); setCreateAnyway(false); setForm((old) => ({ ...old, roomId, ...(room ? { building: room.building } : {}) })); }}><option value="">Área común / equipo</option>{(rooms.length ? rooms : Array.from({ length: 123 }, (_, index) => ({ id: `H${String(index + 1).padStart(3, '0')}`, number: String(index + 1).padStart(3, '0') }))).map((room) => <option key={room.id} value={room.id}>Habitación {room.number}</option>)}</select></Field>
      <Field label="Ubicación / equipo exacto"><input required={!form.roomId} maxLength={120} value={form.location} onChange={change('location')} placeholder="Ej. Piscina · bomba principal" /></Field>
      <Field label="Tipo de avería"><select value={form.fault} onChange={change('fault')}>{!FAULTS.includes(form.fault) && <option>{form.fault}</option>}{FAULTS.map((fault) => <option key={fault}>{fault}</option>)}</select></Field>
      <Field label="Avería / síntoma específico"><input required minLength={3} maxLength={120} value={form.faultDetail} onChange={change('faultDetail')} placeholder="Usa la misma descripción si se repite la falla" /></Field>
      <Field label="Prioridad"><select value={form.priority} onChange={change('priority')}>{Object.entries(PRIORITY).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></Field>
      {manager && <><Field label="Estado"><select value={form.status} onChange={(event) => { const status = event.target.value; setForm((old) => ({ ...old, status, progress: status === 'completed' ? 100 : status === 'pending' ? 0 : Math.max(5, Math.min(99, old.progress)) })); }}>{Object.entries(STATUS).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></Field><Field label={`Avance del trabajo · ${form.progress}%`}><input aria-label="Porcentaje de avance" type="range" min="0" max="100" step="5" value={form.progress} onChange={(event) => { const progress = Number(event.target.value); setForm((old) => ({ ...old, progress, status: progress === 100 ? 'completed' : progress > 0 ? 'progress' : 'pending' })); }} /></Field><Field label="Duración prevista (horas)"><input required type="number" min="0.25" max="10000" step="0.25" value={form.plannedHours} onChange={change('plannedHours')} /></Field></>}
      <Field label={manager ? 'Descripción / plan de trabajo' : 'Descripción de la solicitud'}><textarea rows={3} maxLength={2500} value={form.description} onChange={change('description')} placeholder="Describe la necesidad y su ubicación." /></Field>
      {manager && <Field label="Nota de coordinación"><textarea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Criterio de asignación, alcance o prioridad" /></Field>}
    </div>
    {!form.id && <><h3>Fotos del hallazgo (opcional)</h3><PhotoInput photos={form.photos} onChange={(photos) => setForm((old) => ({ ...old, photos }))} /></>}
    {duplicate && <div className="alert-box"><Link2 size={20} /><div><strong>Ya existe un trabajo abierto: {duplicate.id}</strong><p>{duplicate.title}. Es la misma avería y ubicación. Puedes agregar este hallazgo a su carpeta conservando la evidencia.</p><button type="button" className="button secondary small" onClick={link}>Vincular hallazgo a {duplicate.id}</button><label className="checkbox-field"><input type="checkbox" checked={createAnyway} onChange={(event) => setCreateAnyway(event.target.checked)} />Necesito crear una solicitud independiente</label></div></div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button primary"><CheckCircle2 size={16} />{form.id ? 'Guardar asignación y detalles' : 'Crear solicitud'}</button></div>
  </form></Modal>;
}

function excelSheets(orders, recurring, rooms) {
  const evidence = [];
  for (const order of orders) {
    for (const photo of safePhotos(order.photos)) evidence.push({ order, photo, type: 'Hallazgo inicial', author: order.createdByName || 'Autor anterior no registrado', at: order.createdAt });
    for (const report of order.reports || []) for (const photo of safePhotos(report.photos)) evidence.push({ order, photo, type: 'Reporte técnico', author: actorLabel(report), at: report.at });
    for (const finding of order.findings || []) for (const photo of safePhotos(finding.photos)) evidence.push({ order, photo, type: 'Hallazgo vinculado', author: actorLabel(finding), at: finding.at });
  }
  return [
    { name: 'Trabajos', rows: orders.map((order) => ({ Solicitud: order.id, Trabajo: order.title, Descripción: order.description, Área: order.area, Edificio: order.building, Habitación: roomName(order.roomId || '', rooms), Ubicación: order.location || '', Responsable: memberName(order.owner), Solicitante: order.createdByName || 'No registrado', Prioridad: PRIORITY[order.priority], Estado: STATUS[order.status], 'Avance %': order.progress, Avería: order.fault, Síntoma: order.faultDetail || '', Origen: SOURCES[order.source] || order.source, Registro: order.createdAt, Inicio: order.startedAt || '', Cierre: order.closedAt || '', 'Horas previstas': order.plannedHours || '', 'Horas resolución': order.closedAt ? +hoursBetween(order.createdAt, order.closedAt).toFixed(2) : '' })) },
    { name: 'Historial de avances', rows: orders.flatMap((order) => (order.updates || []).map((update) => ({ Solicitud: order.id, Fecha: update.at, Autor: actorLabel(update), Rol: ROLE_NAMES[update.authorRole] || 'No registrado', 'Avance %': update.progress, Nota: update.note }))) },
    { name: 'Reportes técnicos', rows: orders.flatMap((order) => (order.reports || []).map((report) => ({ Solicitud: order.id, Reporte: report.id, Fecha: report.at, Autor: actorLabel(report), Rol: ROLE_NAMES[report.authorRole] || 'No registrado', Estado: STATUS[report.status], 'Avance %': report.progress, Descripción: report.notes, Fotografías: report.photos?.length || 0 }))) },
    { name: 'Hallazgos vinculados', rows: orders.flatMap((order) => (order.findings || []).map((finding) => ({ Solicitud: order.id, Hallazgo: finding.id, Fecha: finding.at, Autor: actorLabel(finding), Título: finding.title, Descripción: finding.description, Fotografías: finding.photos?.length || 0 }))) },
    { name: 'Reincidencias', rows: recurring.map((group) => ({ Avería: group.title, Edificio: group.building, Ubicación: faultLocation(group, rooms), Reportes: group.count, Solicitudes: group.orders.join(', ') })) },
    { name: 'Evidencias fotográficas', rows: evidence.map(({ order, photo, type, author, at }) => ({ Solicitud: order.id, Trabajo: order.title, Tipo: type, Autor: author, Fecha: at, Archivo: photo.name || 'Fotografía', Evidencia: '' })), images: evidence.map(({ order, photo }) => ({ url: photo.url, name: `${order.id} · ${photo.name || 'Fotografía'}`, column: 0, width: 440, height: 300 })) },
  ];
}

export default function WorkOrders({ data, setData, notify = () => {}, mode = 'orders', user: providedUser }) {
  const user = providedUser || LEGACY_USER;
  const manager = ['admin', 'coordinator'].includes(user.role);
  const requester = user.role === 'requester';
  const technician = user.role === 'technician';
  const canCreate = manager || requester && mode !== 'corrective';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [area, setArea] = useState('all');
  const [priority, setPriority] = useState('all');
  const [editor, setEditor] = useState(null);
  const [folderId, setFolderId] = useState(null);
  const [reportId, setReportId] = useState(null);
  useEffect(() => { setEditor(null); setFolderId(null); setReportId(null); }, [user.id, user.role]);
  const orders = data.orders || [];
  const rooms = data.rooms || [];
  const visibleOrders = orders.filter((order) => manager || technician && !!user.memberId && order.owner === user.memberId || requester && !!user.id && order.createdBy === user.id);
  const relevant = mode === 'corrective' ? visibleOrders.filter((order) => ['preventive', '360', 'rounds', 'corrective'].includes(order.source)) : visibleOrders;
  const filtered = relevant.filter((order) => (status === 'all' || order.status === status) && (area === 'all' || order.area === area) && (priority === 'all' || order.priority === priority) && normalize(`${order.id} ${order.title} ${order.building} ${roomName(order.roomId || '', rooms)} ${order.location || ''} ${order.faultDetail || ''} ${memberName(order.owner)}`).includes(normalize(search)));
  const closed = relevant.filter((order) => order.status === 'completed' && order.closedAt);
  const averageResolution = closed.length ? closed.reduce((sum, order) => sum + hoursBetween(order.createdAt, order.closedAt), 0) / closed.length : 0;
  const averageExecution = closed.length ? closed.reduce((sum, order) => sum + hoursBetween(order.startedAt || order.createdAt, order.closedAt), 0) / closed.length : 0;
  const recurring = useMemo(() => getRecurringFaults(visibleOrders), [orders, user.id, user.role, user.memberId]);
  const averageProgress = relevant.length ? Math.round(relevant.reduce((sum, order) => sum + Number(order.progress || 0), 0) / relevant.length) : 0;
  const chartStatuses = Object.entries(STATUS).map(([id, name]) => ({ name, value: relevant.filter((order) => order.status === id).length })).filter((item) => item.value);
  const chartAreas = AREAS.map((name) => { const list = relevant.filter((order) => order.area === name); return { name, avance: list.length ? Math.round(list.reduce((sum, item) => sum + Number(item.progress || 0), 0) / list.length) : 0 }; });
  const folder = visibleOrders.find((order) => order.id === folderId);
  const reportOrder = visibleOrders.find((order) => order.id === reportId);
  const save = (order) => {
    if (!canCreate && !manager || order.createdBy !== user.id && !manager && !orders.some((item) => item.id === order.id && item.createdBy === user.id)) return;
    setData((old) => ({ ...old, orders: old.orders.some((item) => item.id === order.id) ? old.orders.map((item) => item.id === order.id ? order : item) : [order, ...old.orders] }));
    setEditor(null); setFolderId(order.id); notify(`Trabajo ${order.id} guardado`);
  };
  const linkFinding = (id, finding) => {
    if (!canCreate || !visibleOrders.some((order) => order.id === id)) return;
    setData((old) => ({ ...old, orders: old.orders.map((order) => order.id === id ? { ...order, findings: [...(order.findings || []), finding] } : order) }));
    setEditor(null); setFolderId(id); notify(`Hallazgo vinculado a ${id}; no se creó otra solicitud`);
  };
  const submitReport = (report) => {
    if (!reportOrder || !(manager || technician && user.memberId && reportOrder.owner === user.memberId)) return;
    const id = reportOrder.id;
    setData((old) => ({ ...old, orders: old.orders.map((order) => order.id !== id ? order : {
      ...order,
      progress: report.progress, status: report.status,
      startedAt: order.startedAt || (report.status !== 'pending' ? report.at : null),
      closedAt: report.status === 'completed' ? order.closedAt || report.at : null,
      updates: [...(order.updates || []), { at: report.at, progress: report.progress, note: report.notes, ...actorStamp(user), reportId: report.id }],
      reports: [...(order.reports || []), report],
    }) }));
    setReportId(null); setFolderId(id); notify('Reporte técnico y evidencia registrados');
  };
  const download = async (selectedOrders = filtered) => {
    try { await exportWorkbook(`control-${mode === 'corrective' ? 'correctivos' : 'solicitudes'}-${todayISO()}`, excelSheets(selectedOrders, getRecurringFaults(selectedOrders), rooms)); notify('Excel con reportes y evidencias descargado'); }
    catch { notify('No se pudo generar el Excel. Intenta nuevamente.'); }
  };
  return <div>
    <div className="module-heading"><div><p className="eyebrow">INGENIERÍA · {mode === 'corrective' ? 'ACCIÓN CORRECTIVA' : 'CONTROL DE TRABAJOS'}</p><h2>{technician ? 'Tu trabajo, tu evidencia.' : requester ? 'Solicita y sigue cada trabajo.' : mode === 'corrective' ? 'Del hallazgo a la solución.' : 'Cada trabajo, bajo control.'}</h2><p>{technician ? 'Solo tus trabajos asignados. Registra ejecución, avance y fotografías.' : requester ? 'Crea solicitudes y consulta el seguimiento de tus casos.' : 'Solicitudes, asignaciones y una carpeta de avance para cada trabajo.'}</p></div><div className="inline-actions"><button className="button secondary" onClick={() => download()}><Download size={16} />Excel</button>{canCreate && <button className="button primary" onClick={() => setEditor(blankOrder(mode, user))}><Plus size={17} />{mode === 'corrective' ? 'Nuevo correctivo' : 'Nueva solicitud'}</button>}</div></div>
    <div className="notice"><strong>{ROLE_NAMES[user.role] || 'Sin permisos'}</strong> · {manager ? 'Gestionas prioridades, áreas y responsables. Los reportes conservan su autor.' : technician ? 'La asignación la gestiona coordinación. Tus reportes no modifican los datos ni el responsable de la solicitud.' : 'El personal técnico documenta la ejecución. Puedes consultar tus solicitudes y sus evidencias.'}</div>
    <div className="metric-grid"><article className="metric-card"><Wrench size={20} /><span>Trabajos abiertos</span><strong>{relevant.filter((order) => order.status !== 'completed').length}</strong><small>{relevant.length} registros visibles en el historial</small></article><article className="metric-card"><CheckCircle2 size={20} /><span>Avance promedio</span><strong>{averageProgress}%</strong><small>Promedio de las carpetas visibles</small></article><article className="metric-card"><Clock3 size={20} /><span>Tiempo de resolución</span><strong>{closed.length ? `${averageResolution.toFixed(1)} h` : '—'}</strong><small>Registro a cierre · {closed.length} trabajos cerrados</small></article><article className="metric-card"><Wrench size={20} /><span>Tiempo de ejecución</span><strong>{closed.length ? `${averageExecution.toFixed(1)} h` : '—'}</strong><small>Inicio a cierre · horas transcurridas</small></article></div>
    {!!recurring.length && <section className="alert-box" role="status"><AlertTriangle size={21} /><div><strong>Advertencia de reincidencia · más de 3 reportes</strong>{recurring.map((group) => <p key={group.key}><b>{group.count} reportes:</b> {group.title} · {group.building}, {faultLocation(group, rooms)}. Solicitudes {group.orders.join(', ')}. Revisa la causa raíz.</p>)}<small>Se cuentan solicitudes y hallazgos vinculados del mismo síntoma y ubicación, incluyendo casos cerrados. Los reportes de avance no se cuentan como nuevas averías.</small></div></section>}
    <div className="module-grid" style={{ marginBottom: 24 }}><section className="card chart-card"><h2>Estado de los trabajos</h2>{relevant.length ? <ResponsiveContainer width="100%" height={205}><PieChart><Pie data={chartStatuses} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={4}>{chartStatuses.map((entry) => <Cell key={entry.name} fill={STATUS_COLORS[Object.values(STATUS).indexOf(entry.name)]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <p className="empty-state">Sin trabajos registrados</p>}<div className="summary-row">{Object.entries(STATUS).map(([key, name], index) => <span key={key}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: STATUS_COLORS[index], marginRight: 5 }} />{name}: {relevant.filter((order) => order.status === key).length}</span>)}</div></section><section className="card chart-card"><h2>Avance por área</h2><ResponsiveContainer width="100%" height={240}><BarChart data={chartAreas} margin={{ left: 0, right: 12, top: 12, bottom: 32 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8ecf3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} width={40} /><Tooltip formatter={(value) => [`${value}%`, 'Avance promedio']} /><Bar dataKey="avance" fill="#5367ed" radius={[5, 5, 0, 0]} maxBarSize={45} /></BarChart></ResponsiveContainer></section></div>
    <section className="card"><div className="card-header"><div><h2>{mode === 'corrective' ? 'Plan de mantenimiento correctivo' : 'Solicitudes y carpetas de trabajo'}</h2><p className="card-subtitle">{manager ? 'Abre una carpeta para asignar o consultar los reportes de ejecución.' : technician ? 'Abre el trabajo asignado para registrar un reporte técnico.' : 'Consulta el avance y los reportes técnicos de tus solicitudes.'}</p></div><span className="badge">{filtered.length} de {relevant.length}</span></div><div className="toolbar"><label className="search-field"><Search size={17} /><input aria-label="Buscar trabajos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar trabajo, habitación, avería…" /></label><select aria-label="Filtrar estado de trabajos" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos los estados</option>{Object.entries(STATUS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Filtrar área de trabajos" value={area} onChange={(event) => setArea(event.target.value)}><option value="all">Todas las áreas</option>{AREAS.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Filtrar prioridad de trabajos" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">Todas las prioridades</option>{Object.entries(PRIORITY).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Trabajo / ubicación</th><th>Área / responsable</th><th>Prioridad</th><th>Estado</th><th>Avance</th><th>Carpeta</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><strong>{order.title}</strong><small style={{ display: 'block', marginTop: 5 }}>{order.id} · {order.building} · {order.roomId ? `Hab. ${roomName(order.roomId, rooms)}` : order.location || 'Área común'}</small></td><td>{order.area}<small style={{ display: 'block', marginTop: 5 }}>{memberName(order.owner)}</small></td><td><span className={`badge ${order.priority}`}>{PRIORITY[order.priority]}</span></td><td><span className={`badge ${order.status === 'completed' ? 'success' : order.status === 'progress' ? 'medium' : ''}`}>{STATUS[order.status]}</span></td><td style={{ minWidth: 115 }}><strong>{order.progress || 0}%</strong><div className="progress-track" style={{ marginTop: 8 }}><span className="progress-fill" style={{ width: `${order.progress || 0}%` }} /></div></td><td><button className="button secondary small" aria-label={`Abrir carpeta ${order.id}`} onClick={() => setFolderId(order.id)}><FolderOpen size={15} />Abrir</button></td></tr>)}</tbody></table></div>{!filtered.length && <div className="empty-state"><FolderOpen size={28} /><h3>No hay trabajos con estos filtros</h3><p>{technician ? 'Coordinación debe asignarte un trabajo para que puedas reportar su ejecución.' : 'Prueba otra búsqueda o crea una solicitud.'}</p><button className="button secondary small" onClick={() => { setSearch(''); setStatus('all'); setArea('all'); setPriority('all'); }}>Limpiar filtros</button></div>}<div className="table-footer">Los casos cerrados conservan su carpeta, autoría y evidencia. No se eliminan automáticamente.</div></section>
    {editor && canCreate && (!editor.id || manager) && <OrderEditor order={editor} mode={mode} rooms={rooms} user={user} orders={visibleOrders} onSave={save} onLink={linkFinding} onClose={() => setEditor(null)} />}
    {folder && !editor && !reportId && <OrderFolder order={folder} rooms={rooms} user={user} onClose={() => setFolderId(null)} onEdit={() => setEditor(folder)} onReport={() => { setReportId(folder.id); }} onExport={() => download([folder])} />}
    {reportOrder && (manager || technician && user.memberId && reportOrder.owner === user.memberId) && <ReportEditor order={reportOrder} user={user} onClose={() => setReportId(null)} onSubmit={submitReport} />}
  </div>;
}
