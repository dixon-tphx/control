import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Download, FolderOpen, Plus, Search, Wrench } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TEAM, AREAS, BUILDINGS, Modal, Field, exportWorkbook, uid, todayISO, formatDate } from '../shared';

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
  ].map((item) => ({ ...item, roomId: canonicalRoomId(item.roomId), owner: memberForArea(item.area), updates: [{ at: item.createdAt, progress: 0, note: 'Solicitud registrada · datos de ejemplo' }] }));
}

export function getRecurringFaults(orders) {
  const groups = new Map();
  for (const order of orders) {
    const symptom = normalize(order.faultDetail || order.fault);
    const location = order.roomId ? `habitación ${String(canonicalRoomId(order.roomId)).replace(/^H(?=\d)/i, '')}` : normalize(order.location || '');
    if (!symptom || !location || !order.building) continue;
    const key = [normalize(order.fault), symptom, normalize(order.building), normalize(location)].join('|');
    const old = groups.get(key) || { key, title: order.faultDetail || order.fault, building: order.building, roomId: canonicalRoomId(order.roomId || ''), location, count: 0, orders: [] };
    old.count += 1; old.orders.push(order.id); groups.set(key, old);
  }
  return [...groups.values()].filter((group) => group.count > 3).sort((a, b) => b.count - a.count);
}

function blankOrder(mode) {
  const area = AREAS[0];
  return { title: '', description: '', area, building: BUILDINGS[0], roomId: '', location: '', owner: memberForArea(area), priority: 'medium', status: 'pending', progress: 0, fault: FAULTS[0], faultDetail: '', source: mode === 'corrective' ? 'corrective' : 'request', plannedHours: 4 };
}

function OrderEditor({ order, mode, rooms = [], onSave, onClose }) {
  const [form, setForm] = useState({ ...blankOrder(mode), ...order, roomId: canonicalRoomId(order.roomId || ''), description: order.description || '', progress: Number(order.progress || 0), faultDetail: order.faultDetail || order.fault || '', location: order.location || '', plannedHours: order.plannedHours || 4 });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const people = TEAM.filter((member) => member.area === form.area);
  const change = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const handleSubmit = (event) => {
    event.preventDefault();
    if (form.title.trim().length < 3 || form.faultDetail.trim().length < 3) { setError('Escribe un título y una descripción de la avería de al menos 3 caracteres.'); return; }
    if (!form.roomId && !form.location.trim()) { setError('Selecciona una habitación o escribe la ubicación exacta.'); return; }
    if (!people.some((member) => member.id === form.owner)) { setError('Asigna un responsable del área seleccionada.'); return; }
    if (Number(form.plannedHours) <= 0) { setError('La duración prevista debe ser mayor que cero.'); return; }
    const now = new Date().toISOString();
    const completed = form.status === 'completed';
    const progress = completed ? 100 : Math.min(99, Math.max(0, Number(form.progress)));
    const saved = {
      ...form, id: form.id || uid('OT'), title: form.title.trim(), description: form.description.trim(), faultDetail: form.faultDetail.trim(), location: form.location.trim(),
      plannedHours: Number(form.plannedHours), progress,
      createdAt: form.createdAt || now,
      startedAt: form.startedAt || (form.status !== 'pending' ? now : null),
      closedAt: completed ? form.closedAt || now : null,
      updates: [...(form.updates || []), { at: now, progress, note: note.trim() || (form.id ? `Actualización · ${STATUS[form.status]}` : 'Solicitud registrada') }],
    };
    onSave(saved);
  };
  return <Modal title={form.id ? `Carpeta de trabajo · ${form.id}` : mode === 'corrective' ? 'Nuevo trabajo correctivo' : 'Nueva solicitud de trabajo'} onClose={onClose} wide>
    <form onSubmit={handleSubmit}>
      <div className="modal-body">
        {form.id && <div className="summary-row"><span className={`badge ${form.status === 'completed' ? 'success' : 'medium'}`}>{SOURCES[form.source] || form.source || 'Solicitud'}</span><span className="muted">Registrada: {formatDate(form.createdAt)}</span>{form.closedAt && <span className="muted">Cerrada: {formatDate(form.closedAt)}</span>}</div>}
        <div className="form-grid">
          <Field label="Solicitud / trabajo"><input required minLength={3} maxLength={160} value={form.title} onChange={change('title')} placeholder="Describe el trabajo a realizar" /></Field>
          <Field label="Área responsable"><select value={form.area} onChange={(event) => { const area = event.target.value; setForm((old) => ({ ...old, area, owner: memberForArea(area) })); }}>{AREAS.map((area) => <option key={area}>{area}</option>)}</select></Field>
          <Field label="Responsable del área"><select required value={form.owner} onChange={change('owner')}>{!people.length && <option value="">Sin personal en esta área</option>}{people.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
          <Field label="Edificio"><select value={form.building} onChange={change('building')}>{BUILDINGS.map((building) => <option key={building}>{building}</option>)}</select></Field>
          <Field label="Habitación (si corresponde)"><select value={form.roomId} onChange={change('roomId')}><option value="">Área común / equipo</option>{(rooms.length ? rooms : Array.from({ length: 123 }, (_, index) => ({ id: `H${String(index + 1).padStart(3, '0')}`, number: String(index + 1).padStart(3, '0') }))).map((room) => <option key={room.id} value={room.id}>Habitación {room.number}</option>)}</select></Field>
          <Field label="Ubicación / equipo exacto"><input required={!form.roomId} maxLength={120} value={form.location} onChange={change('location')} placeholder="Ej. Piscina · bomba principal" /></Field>
          <Field label="Tipo de avería"><select value={form.fault} onChange={change('fault')}>{!FAULTS.includes(form.fault) && <option>{form.fault}</option>}{FAULTS.map((fault) => <option key={fault}>{fault}</option>)}</select></Field>
          <Field label="Avería / síntoma específico"><input required minLength={3} maxLength={120} value={form.faultDetail} onChange={change('faultDetail')} placeholder="Usa la misma descripción si se repite la falla" /></Field>
          <Field label="Prioridad"><select value={form.priority} onChange={change('priority')}>{Object.entries(PRIORITY).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></Field>
          <Field label="Estado"><select value={form.status} onChange={(event) => { const status = event.target.value; setForm((old) => ({ ...old, status, progress: status === 'completed' ? 100 : status === 'pending' ? 0 : Math.max(5, Math.min(99, old.progress)) })); }}>{Object.entries(STATUS).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></Field>
          <Field label={`Avance del trabajo · ${form.progress}%`}><input aria-label="Porcentaje de avance" type="range" min="0" max="100" step="5" value={form.progress} onChange={(event) => { const progress = Number(event.target.value); setForm((old) => ({ ...old, progress, status: progress === 100 ? 'completed' : progress > 0 ? 'progress' : 'pending' })); }} /><div className="progress-track"><span className="progress-fill" style={{ width: `${form.progress}%` }} /></div></Field>
          <Field label="Duración prevista (horas)"><input required type="number" min="0.25" max="10000" step="0.25" value={form.plannedHours} onChange={change('plannedHours')} /></Field>
          <Field label="Descripción / plan de trabajo"><textarea rows={3} maxLength={2500} value={form.description} onChange={change('description')} placeholder="Alcance, acciones y materiales necesarios" /></Field>
          <Field label="Nota de esta actualización"><textarea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Trabajo ejecutado, hallazgos o verificación de cierre" /></Field>
        </div>
        <p className="notice">Las reincidencias se agrupan por avería específica + edificio + habitación o ubicación. Conserva la misma descripción del síntoma para relacionar reportes.</p>
        {!!form.updates?.length && <section className="card" style={{ padding: 18, marginTop: 20 }}><h3 style={{ marginTop: 0 }}>Historial de la carpeta</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Avance</th><th>Registro</th></tr></thead><tbody>{[...form.updates].reverse().map((update, index) => <tr key={`${update.at}-${index}`}><td>{formatDate(update.at)}</td><td>{update.progress}%</td><td>{update.note}</td></tr>)}</tbody></table></div></section>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
      <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button primary"><CheckCircle2 size={16} />{form.id ? 'Guardar avance' : 'Crear solicitud'}</button></div>
    </form>
  </Modal>;
}

export default function WorkOrders({ data, setData, notify, mode = 'orders' }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [area, setArea] = useState('all');
  const [priority, setPriority] = useState('all');
  const [editor, setEditor] = useState(null);
  const orders = data.orders || [];
  const rooms = data.rooms || [];
  const relevant = mode === 'corrective' ? orders.filter((order) => ['preventive', '360', 'rounds', 'corrective'].includes(order.source)) : orders;
  const filtered = relevant.filter((order) => (status === 'all' || order.status === status) && (area === 'all' || order.area === area) && (priority === 'all' || order.priority === priority) && normalize(`${order.id} ${order.title} ${order.building} ${roomName(order.roomId || '', rooms)} ${order.location || ''} ${order.faultDetail || ''} ${memberName(order.owner)}`).includes(normalize(search)));
  const closed = relevant.filter((order) => order.status === 'completed' && order.closedAt);
  const averageResolution = closed.length ? closed.reduce((sum, order) => sum + hoursBetween(order.createdAt, order.closedAt), 0) / closed.length : 0;
  const averageExecution = closed.length ? closed.reduce((sum, order) => sum + hoursBetween(order.startedAt || order.createdAt, order.closedAt), 0) / closed.length : 0;
  const recurring = useMemo(() => getRecurringFaults(orders), [orders]);
  const averageProgress = relevant.length ? Math.round(relevant.reduce((sum, order) => sum + Number(order.progress || 0), 0) / relevant.length) : 0;
  const chartStatuses = Object.entries(STATUS).map(([id, name]) => ({ name, value: relevant.filter((order) => order.status === id).length })).filter((item) => item.value);
  const chartAreas = AREAS.map((name) => { const list = relevant.filter((order) => order.area === name); return { name, avance: list.length ? Math.round(list.reduce((sum, item) => sum + Number(item.progress || 0), 0) / list.length) : 0 }; });
  const save = (order) => {
    setData((old) => ({ ...old, orders: order.id && old.orders.some((item) => item.id === order.id) ? old.orders.map((item) => item.id === order.id ? order : item) : [order, ...old.orders] }));
    setEditor(null); notify(`Trabajo ${order.id} guardado`);
  };
  const download = async () => {
    try {
      await exportWorkbook(`control-${mode === 'corrective' ? 'correctivos' : 'solicitudes'}-${todayISO()}`, [
        { name: 'Trabajos', rows: filtered.map((order) => ({ Solicitud: order.id, Trabajo: order.title, Descripción: order.description, Área: order.area, Edificio: order.building, Habitación: roomName(order.roomId || '', rooms), Ubicación: order.location || '', Responsable: memberName(order.owner), Prioridad: PRIORITY[order.priority], Estado: STATUS[order.status], 'Avance %': order.progress, Avería: order.fault, Síntoma: order.faultDetail || '', Origen: SOURCES[order.source] || order.source, Registro: order.createdAt, Inicio: order.startedAt || '', Cierre: order.closedAt || '', 'Horas previstas': order.plannedHours || '', 'Horas resolución': order.closedAt ? +hoursBetween(order.createdAt, order.closedAt).toFixed(2) : '' })) },
        { name: 'Historial de avances', rows: filtered.flatMap((order) => (order.updates || []).map((update) => ({ Solicitud: order.id, Fecha: update.at, 'Avance %': update.progress, Nota: update.note }))) },
        { name: 'Reincidencias', rows: recurring.map((group) => ({ Avería: group.title, Edificio: group.building, Ubicación: faultLocation(group, rooms), Reportes: group.count, Solicitudes: group.orders.join(', ') })) },
      ]);
      notify('Archivo Excel descargado');
    } catch { notify('No se pudo generar el Excel. Intenta nuevamente.'); }
  };
  return <div>
    <div className="module-heading"><div><p className="eyebrow">INGENIERÍA · {mode === 'corrective' ? 'ACCIÓN CORRECTIVA' : 'CONTROL DE TRABAJOS'}</p><h2>{mode === 'corrective' ? 'Del hallazgo a la solución.' : 'Cada trabajo, bajo control.'}</h2><p>{mode === 'corrective' ? 'Planifica la corrección de hallazgos de preventivos, habitaciones 360 y recorridas.' : 'Solicitudes, responsables y una carpeta de avance para cada trabajo.'}</p></div><div className="inline-actions"><button className="button secondary" onClick={download}><Download size={16} />Excel</button><button className="button primary" onClick={() => setEditor(blankOrder(mode))}><Plus size={17} />{mode === 'corrective' ? 'Nuevo correctivo' : 'Nueva solicitud'}</button></div></div>
    <div className="metric-grid"><article className="metric-card"><ClipboardIcon /><span>Trabajos abiertos</span><strong>{relevant.filter((order) => order.status !== 'completed').length}</strong><small>{relevant.length} registros en el historial</small></article><article className="metric-card"><CheckCircle2 size={20} /><span>Avance promedio</span><strong>{averageProgress}%</strong><small>Promedio de las carpetas de trabajo</small></article><article className="metric-card"><Clock3 size={20} /><span>Tiempo de resolución</span><strong>{closed.length ? `${averageResolution.toFixed(1)} h` : '—'}</strong><small>Registro a cierre · {closed.length} trabajos cerrados</small></article><article className="metric-card"><Wrench size={20} /><span>Tiempo de ejecución</span><strong>{closed.length ? `${averageExecution.toFixed(1)} h` : '—'}</strong><small>Inicio a cierre · horas transcurridas</small></article></div>
    {!!recurring.length && <section className="alert-box" role="status"><AlertTriangle size={21} /><div><strong>Advertencia de reincidencia · más de 3 reportes</strong>{recurring.map((group) => <p key={group.key}><b>{group.count} reportes:</b> {group.title} · {group.building}, {faultLocation(group, rooms)}. Solicitudes {group.orders.join(', ')}. Revisa la causa raíz.</p>)}<small>Conteo del historial completo, incluyendo trabajos cerrados. Se relacionan el mismo síntoma y la misma ubicación.</small></div></section>}
    <div className="module-grid" style={{ marginBottom: 24 }}><section className="card chart-card"><h2>Estado de los trabajos</h2>{relevant.length ? <ResponsiveContainer width="100%" height={205}><PieChart><Pie data={chartStatuses} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={4}>{chartStatuses.map((entry) => <Cell key={entry.name} fill={STATUS_COLORS[Object.values(STATUS).indexOf(entry.name)]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <p className="empty-state">Sin trabajos registrados</p>}<div className="summary-row">{Object.entries(STATUS).map(([key, name], index) => <span key={key}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: STATUS_COLORS[index], marginRight: 5 }} />{name}: {relevant.filter((order) => order.status === key).length}</span>)}</div></section><section className="card chart-card"><h2>Avance por área</h2><ResponsiveContainer width="100%" height={240}><BarChart data={chartAreas} margin={{ left: 0, right: 12, top: 12, bottom: 32 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8ecf3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} width={40} /><Tooltip formatter={(value) => [`${value}%`, 'Avance promedio']} /><Bar dataKey="avance" fill="#5367ed" radius={[5, 5, 0, 0]} maxBarSize={45} /></BarChart></ResponsiveContainer></section></div>
    <section className="card"><div className="card-header"><div><h2>{mode === 'corrective' ? 'Plan de mantenimiento correctivo' : 'Solicitudes y carpetas de trabajo'}</h2><p className="card-subtitle">Abre una carpeta para actualizar el porcentaje, documentar acciones o cerrar el caso.</p></div><span className="badge">{filtered.length} de {relevant.length}</span></div><div className="toolbar"><label className="search-field"><Search size={17} /><input aria-label="Buscar trabajos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar trabajo, habitación, avería…" /></label><select aria-label="Filtrar estado de trabajos" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos los estados</option>{Object.entries(STATUS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Filtrar área de trabajos" value={area} onChange={(event) => setArea(event.target.value)}><option value="all">Todas las áreas</option>{AREAS.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Filtrar prioridad de trabajos" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">Todas las prioridades</option>{Object.entries(PRIORITY).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Trabajo / ubicación</th><th>Área / responsable</th><th>Prioridad</th><th>Estado</th><th>Avance</th><th>Carpeta</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><strong>{order.title}</strong><small style={{ display: 'block', marginTop: 5 }}>{order.id} · {order.building} · {order.roomId ? `Hab. ${roomName(order.roomId, rooms)}` : order.location || 'Área común'}</small></td><td>{order.area}<small style={{ display: 'block', marginTop: 5 }}>{memberName(order.owner)}</small></td><td><span className={`badge ${order.priority}`}>{PRIORITY[order.priority]}</span></td><td><span className={`badge ${order.status === 'completed' ? 'success' : order.status === 'progress' ? 'medium' : ''}`}>{STATUS[order.status]}</span></td><td style={{ minWidth: 115 }}><strong>{order.progress}%</strong><div className="progress-track" style={{ marginTop: 8 }}><span className="progress-fill" style={{ width: `${order.progress}%` }} /></div></td><td><button className="button secondary small" aria-label={`Abrir carpeta ${order.id}`} onClick={() => setEditor(order)}><FolderOpen size={15} />Abrir</button></td></tr>)}</tbody></table></div>{!filtered.length && <div className="empty-state"><FolderOpen size={28} /><h3>No hay trabajos con estos filtros</h3><p>Prueba otra búsqueda o crea una nueva solicitud.</p><button className="button secondary small" onClick={() => { setSearch(''); setStatus('all'); setArea('all'); setPriority('all'); }}>Limpiar filtros</button></div>}<div className="table-footer">Los casos cerrados conservan su carpeta y su historial. No se eliminan automáticamente.</div></section>
    {editor && <OrderEditor order={editor} mode={mode} rooms={rooms} onSave={save} onClose={() => setEditor(null)} />}
  </div>;
}

function ClipboardIcon() { return <Wrench size={20} />; }
