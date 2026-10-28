import { useState } from 'react';
import { BookOpenCheck, Play, Plus, Pencil, Download, ShieldAlert, CheckCircle2, Clock3, Settings2 } from 'lucide-react';
import { Modal, Field, PhotoInput, uid, todayISO, formatDate, exportWorkbook } from '../shared';
import { managerRole } from '../domain';

const normalized = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const currentActor = (user) => ({ actorId: user?.id || 'demo-coordinator', actorName: user?.name || 'Coordinación de demostración', actorRole: user?.role || 'coordinator' });
const applicable = (step, run) => step.applicability !== 'entry' || run.entryAllowed === 'yes';
const requiredFor = (run) => run.steps.filter((step) => step.required && applicable(step, run));

function TemplateEditor({ protocol, user, onClose, onSave }) {
  const [form, setForm] = useState({ ...protocol, lines: protocol.steps.map((step) => `${step.phase} | ${step.role} | ${step.title}${step.applicability === 'entry' ? ' | SOLO_INGRESO' : ''}`).join('\n') });
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    const raw = form.lines.split('\n').map((line) => line.trim()).filter(Boolean);
    if (form.title.trim().length < 3 || !raw.length || raw.some((line) => line.split('|').length < 3)) { setError('Cada paso debe tener fase | rol responsable | instrucción.'); return; }
    if (form.reviewStatus === 'reviewed' && !form.reviewReference?.trim()) { setError('Para registrar revisión necesitas una referencia del documento o aprobación vigente.'); return; }
    const { lines, ...rest } = form;
    const steps = raw.map((line, index) => {
      const [phase, role, title, condition] = line.split('|').map((value) => value.trim());
      return { id: `PASO-${index + 1}`, phase, role, title, required: true, ...(condition === 'SOLO_INGRESO' ? { applicability: 'entry' } : {}) };
    });
    if (steps.some((step) => !step.phase || !step.role || !step.title)) { setError('Completa fase, responsable e instrucción de todos los pasos.'); return; }
    onSave({ ...rest, title: form.title.trim(), steps, id: protocol.id || uid('SEQ'), version: (protocol.version || 0) + 1, approvedBy: form.reviewStatus === 'reviewed' ? user?.name || 'Coordinación demo' : '', approvedById: form.reviewStatus === 'reviewed' ? user?.id || 'demo-coordinator' : '', approvedAt: form.reviewStatus === 'reviewed' ? new Date().toISOString() : '', updatedAt: new Date().toISOString() });
  }
  return <Modal title={protocol.id ? 'Revisar secuencia de servicio' : 'Nueva secuencia de servicio'} onClose={onClose} wide><form onSubmit={submit}>
    <div className="notice">La edición produce una nueva versión. Las ejecuciones anteriores conservan su propia copia. Registrar una revisión aquí es trazabilidad interna, no una firma digital certificada.</div>
    <div className="form-grid"><Field label="Nombre de la secuencia"><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required minLength={3} maxLength={160} /></Field><Field label="Categoría"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required maxLength={80} /></Field><Field label="Estado de revisión"><select value={form.reviewStatus} onChange={(event) => setForm({ ...form, reviewStatus: event.target.value })}><option value="draft">Borrador · pendiente de aprobación hotelera</option><option value="reviewed">Revisión interna registrada</option></select></Field><Field label="Referencia de revisión / aprobación"><input value={form.reviewReference || ''} onChange={(event) => setForm({ ...form, reviewReference: event.target.value })} required={form.reviewStatus === 'reviewed'} maxLength={250} placeholder="Código / versión / acta del plan vigente" /></Field></div>
    <Field label="Notas de revisión y limitaciones"><textarea value={form.reviewNote || ''} onChange={(event) => setForm({ ...form, reviewNote: event.target.value })} rows={3} maxLength={3000} /></Field>
    <Field label="Pasos: fase | rol responsable | instrucción (una línea por paso)"><textarea value={form.lines} onChange={(event) => setForm({ ...form, lines: event.target.value })} rows={13} required maxLength={25000} /></Field>
    {form.requiresEntryDecision && <p className="muted">Conserva el sufijo « | SOLO_INGRESO» en los pasos que aplican únicamente si se autoriza el ingreso.</p>}
    <h3>Directorio por rol</h3><p className="muted">Los contactos son campos vacíos para completar con el directorio vigente del hotel. No se copiaron teléfonos personales de los documentos.</p><div className="form-grid">{form.contacts.map((contact, index) => <Field key={contact.role} label={contact.role}><input value={contact.contact} maxLength={200} placeholder="Canal / extensión aprobada" onChange={(event) => setForm({ ...form, contacts: form.contacts.map((entry, i) => i === index ? { ...entry, contact: event.target.value } : entry) })} /></Field>)}</div>
    <p className="muted">Fuentes: {form.sourceFiles.join(' · ')}</p>{error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary">Guardar versión</button></div>
  </form></Modal>;
}

function RunEditor({ run, user, settings, onClose, onSave }) {
  const [form, setForm] = useState(run);
  const [error, setError] = useState('');
  const closed = run.status === 'completed';
  const canEdit = !closed && (managerRole(user) || run.actorId === user?.id);
  const actor = currentActor(user);
  const eligible = requiredFor(form);
  const done = eligible.filter((step) => step.completed).length;
  const updateStep = (id, patch) => setForm((old) => ({ ...old, steps: old.steps.map((step) => step.id === id ? { ...step, ...patch } : step) }));
  function toggle(step, index, checked) {
    if (checked && form.steps.slice(0, index).some((entry) => entry.required && applicable(entry, form) && !entry.completed)) { setError('Completa primero los pasos anteriores que aplican.'); return; }
    if (checked && form.criticalLevel && step.phase === 'Ejecución' && (form.approvalRoles || []).some((role) => !form.approvals?.[role]?.trim())) { setError('Documenta las autorizaciones previas antes de registrar el inicio de la ejecución.'); return; }
    setError(''); updateStep(step.id, { completed: checked, at: checked ? new Date().toISOString() : null, by: checked ? actor.actorName : '', byId: checked ? actor.actorId : '' });
  }
  function save(finish) {
    if (!canEdit) return;
    if (!form.location.trim()) { setError('Indica el edificio / habitación / ubicación.'); return; }
    if (form.waterReserve && form.reservePercent !== '' && form.reservePercent != null && (!Number.isFinite(Number(form.reservePercent)) || Number(form.reservePercent) < 0 || Number(form.reservePercent) > 100)) { setError('La reserva remanente debe ser un porcentaje entre 0 y 100.'); return; }
    if (finish && form.criticalLevel && (!form.system?.trim() || !form.equipmentId?.trim() || !form.scope?.trim() || !form.orderReference?.trim() || !Number.isFinite(Number(form.estimatedHours)) || Number(form.estimatedHours) <= 0)) { setError('Completa sistema, equipo, alcance, duración estimada y referencia del permiso crítico.'); return; }
    if (finish && form.requiresEntryDecision && !form.entryAllowed) { setError('Registra si hubo autorización de ingreso.'); return; }
    if (finish && eligible.some((step) => !step.completed)) { setError('Faltan pasos obligatorios. Guarda el avance para continuar después.'); return; }
    if (finish && (form.approvalRoles || []).some((role) => !form.approvals?.[role]?.trim())) { setError('Documenta las referencias de todos los autorizadores antes de finalizar.'); return; }
    const at = new Date().toISOString();
    const saved = { ...form, updatedAt: at, status: finish ? 'completed' : 'open', closedAt: finish ? at : null, events: [...(run.events || []), { at, ...actor, action: finish ? 'Cierre documentado' : 'Avance guardado', completedSteps: form.steps.filter((step) => step.completed).map((step) => step.id), notes: form.notes || '' }] };
    onSave(saved, finish);
  }
  const waterPercent = form.reservePercent === '' || form.reservePercent == null ? null : Number(form.reservePercent);
  const threshold = settings.waterReserveAlertPercent;
  return <Modal title={`${form.simulation ? 'Simulación' : 'Ejecución'} · ${form.title}`} onClose={onClose} wide>
    <div className="summary-row"><span className={`badge ${closed ? 'success' : 'medium'}`}>{closed ? 'Finalizada' : 'Abierta'}</span><span className="muted">{form.id} · versión {form.version}</span></div>
    <p className="notice">{form.simulation ? 'Plantilla sin aprobación hotelera: esta ejecución está marcada como simulación y no acredita normalización real de ningún sistema.' : 'La documentación de esta secuencia no ejecuta maniobras ni sustituye autorizaciones y permisos del hotel.'}</p>
    <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, minWidth: 0 }}><div className="form-grid"><Field label="Ubicación / edificio / habitación"><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} maxLength={180} required placeholder="Indica la ubicación exacta" /></Field><Field label="Orden / permiso relacionado"><input value={form.orderReference || ''} onChange={(event) => setForm({ ...form, orderReference: event.target.value })} maxLength={140} /></Field></div>
    {form.criticalLevel && <><div className="form-grid"><Field label="Sistema crítico"><select value={form.system || ''} onChange={(event) => setForm({ ...form, system: event.target.value })}><option value="">Seleccionar sistema</option>{['E-One', 'Generadores', 'Supresión / detección', 'Agua potable', 'Gas LP', 'Otro sistema crítico'].map((name) => <option key={name}>{name}</option>)}</select></Field><Field label="Equipo / ID de activo"><input value={form.equipmentId || ''} onChange={(event) => setForm({ ...form, equipmentId: event.target.value })} maxLength={140} /></Field><Field label="Duración estimada del trabajo (horas)"><input type="number" min="0.1" step="0.1" value={form.estimatedHours || ''} onChange={(event) => setForm({ ...form, estimatedHours: event.target.value })} /></Field><Field label="Técnico / contratista responsable"><input value={form.contractor || ''} onChange={(event) => setForm({ ...form, contractor: event.target.value })} maxLength={180} /></Field></div><Field label="Alcance técnico, servicios afectados y tiempo máximo tolerable fuera de servicio"><textarea rows={3} value={form.scope || ''} onChange={(event) => setForm({ ...form, scope: event.target.value })} maxLength={4000} /></Field></>}
    {form.requiresEntryDecision && <Field label="Autorización de ingreso"><select value={form.entryAllowed || ''} onChange={(event) => setForm({ ...form, entryAllowed: event.target.value })}><option value="">Pendiente de confirmar</option><option value="yes">Sí · ingreso autorizado</option><option value="no">No · sin ingreso / No Molestar / sin consentimiento</option></select></Field>}
    {form.waterReserve && <><Field label="Porcentaje de reserva de agua REMANENTE"><input type="number" min="0" max="100" step="0.1" value={form.reservePercent ?? ''} onChange={(event) => setForm({ ...form, reservePercent: event.target.value })} placeholder="% de agua disponible, no porcentaje agotado" /></Field>{threshold == null ? <p className="alert-box">Umbral no configurado. Gerencia debe aclarar y aprobar el porcentaje de reserva remanente.</p> : waterPercent != null && waterPercent <= Number(threshold) && <p className="alert-box" role="alert">Reserva {waterPercent}% ≤ umbral aprobado {threshold}%. Notifica al Supervisor y coordina con proveedor de agua y Compras según la secuencia; el sistema no realiza llamadas.</p>}</>}
    <div className="summary-row"><strong>{done} de {eligible.length} pasos obligatorios que aplican</strong><span className="muted">Inicio: {formatDate(form.createdAt)} · {form.actorName}</span></div>
    <div className="checklist">{form.steps.map((step, index) => {
      const applies = applicable(step, form);
      return <div className="check-row" key={step.id} style={!applies ? { opacity: 0.55 } : undefined}><small className="eyebrow">{step.phase} · {step.role}</small><label className="checkbox-field"><input type="checkbox" disabled={!applies || !canEdit} checked={!!step.completed && applies} onChange={(event) => toggle(step, index, event.target.checked)} /><strong>{step.title}</strong></label>{!applies && <p className="muted">No aplica mientras no exista autorización de ingreso.</p>}{step.completed && <small className="muted">{new Date(step.at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })} · {step.by}</small>}{applies && <Field label={`Nota / evidencia documental del paso ${index + 1}`}><textarea rows={2} maxLength={1500} value={step.notes || ''} onChange={(event) => updateStep(step.id, { notes: event.target.value })} /></Field>}</div>;
    })}</div>
    <h3>Constancias de autorización</h3><p className="muted">Registra quién autorizó y la referencia de acta, permiso o comunicación. Son constancias manuales; no verifican la identidad ni equivalen a firmas digitales.</p><div className="form-grid">{(form.approvalRoles || []).map((role) => <Field label={`Constancia · ${role}`} key={role}><input maxLength={350} value={form.approvals?.[role] || ''} onChange={(event) => setForm({ ...form, approvals: { ...form.approvals, [role]: event.target.value } })} placeholder="Responsable · referencia · fecha / hora" /></Field>)}</div>
    <Field label="Bitácora general / comunicaciones / rondines"><textarea value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} maxLength={10000} placeholder="Registra cada comunicación o rondín con fecha, hora, responsable y resultado." /></Field>
    {canEdit ? <PhotoInput photos={form.photos || []} onChange={(photos) => setForm({ ...form, photos })} /> : <div className="photo-grid">{(form.photos || []).map((photo) => <div className="photo-item" key={photo.id}><img src={photo.url} alt={photo.name || 'Evidencia de ejecución'} /></div>)}</div>}
    </fieldset>
    <p className="muted">Fuentes: {(form.sourceFiles || []).join(' · ')}</p>
    {form.events?.length > 0 && <details><summary>Auditoría de esta ejecución ({form.events.length})</summary><ul>{form.events.map((event, index) => <li key={index}>{formatDate(event.at)} · {event.actorName} · {event.action}</li>)}</ul></details>}
    {error && <p className="field-error" role="alert">{error}</p>}<div className="modal-footer"><button className="button secondary" onClick={onClose}>Cerrar</button>{canEdit && <><button className="button secondary" onClick={() => save(false)}>Guardar avance</button><button className="button primary" onClick={() => save(true)}><CheckCircle2 size={16} />{form.simulation ? 'Finalizar simulación' : 'Documentar restitución y cerrar'}</button></>}</div>
  </Modal>;
}

export default function ServiceSequences({ data, setData, notify, user, currentUser }) {
  const actorUser = currentUser || user;
  const manager = managerRole(actorUser);
  const protocols = data.protocols || [];
  const runs = data.protocolRuns || [];
  const settings = data.protocolSettings || { waterReserveAlertPercent: null };
  const [view, setView] = useState('protocols'), [query, setQuery] = useState(''), [category, setCategory] = useState('all');
  const [editor, setEditor] = useState(null), [runEditor, setRunEditor] = useState(null), [settingsOpen, setSettingsOpen] = useState(false);
  const [reserve, setReserve] = useState(settings.waterReserveAlertPercent ?? ''), [reference, setReference] = useState(settings.waterReserveReference || '');
  const [busy, setBusy] = useState(false);
  const filtered = protocols.filter((protocol) => (category === 'all' || protocol.category === category) && normalized(`${protocol.title} ${protocol.category}`).includes(normalized(query)));
  const visibleRuns = runs.filter((run) => (manager || run.actorId === actorUser?.id) && normalized(`${run.title} ${run.location} ${run.id}`).includes(normalized(query)));
  function saveTemplate(protocol) {
    if (!manager) return;
    setData((old) => ({ ...old, protocols: (old.protocols || []).some((row) => row.id === protocol.id) ? old.protocols.map((row) => row.id === protocol.id ? protocol : row) : [...(old.protocols || []), protocol] }));
    setEditor(null); notify('Versión de secuencia guardada');
  }
  function start(protocol) {
    if (actorUser?.role === 'requester') return;
    const at = new Date().toISOString(), actor = currentActor(actorUser);
    const run = { ...structuredClone(protocol), id: uid('EJEC'), protocolId: protocol.id, simulation: protocol.reviewStatus !== 'reviewed', status: 'open', createdAt: at, updatedAt: at, closedAt: null, ...actor, location: '', notes: '', orderReference: '', approvals: {}, photos: [], entryAllowed: '', reservePercent: '', steps: protocol.steps.map((step) => ({ ...step, completed: false, notes: '', at: null, by: '' })), events: [{ at, ...actor, action: 'Ejecución iniciada' }] };
    setData((old) => ({ ...old, protocolRuns: [run, ...(old.protocolRuns || [])] })); setRunEditor(run); setView('runs');
  }
  function saveRun(run, finish) {
    if (!manager && run.actorId !== actorUser?.id) return;
    setData((old) => ({ ...old, protocolRuns: (old.protocolRuns || []).map((entry) => entry.id === run.id ? run : entry) }));
    setRunEditor(null); notify(finish ? run.simulation ? 'Simulación finalizada y conservada en historial' : 'Restitución documentada y ejecución cerrada' : 'Avance de secuencia guardado');
  }
  function saveSettings(event) {
    event.preventDefault(); if (!manager) return;
    const value = reserve === '' ? null : Number(reserve);
    if (value != null && (!Number.isFinite(value) || value < 0 || value > 100 || !reference.trim())) { notify('Indica un porcentaje entre 0 y 100 y la referencia de aprobación.'); return; }
    setData((old) => ({ ...old, protocolSettings: { ...old.protocolSettings, waterReserveAlertPercent: value, waterReserveReference: reference.trim(), configuredAt: new Date().toISOString(), ...currentActor(actorUser) } }));
    setSettingsOpen(false); notify(value == null ? 'Umbral de reserva desactivado' : `Umbral guardado: ${value}% de reserva remanente`);
  }
  async function download() {
    setBusy(true);
    try { await exportWorkbook(`secuencias-servicio-${todayISO()}`, [
      { name: 'Secuencias', rows: protocols.map((row) => ({ Código: row.id, Secuencia: row.title, Categoría: row.category, Versión: row.version, Revisión: row.reviewStatus === 'draft' ? 'Borrador' : 'Revisión interna registrada', Referencia: row.reviewReference || '', Fuentes: row.sourceFiles.join(' | '), Observaciones: row.reviewNote })) },
      { name: 'Pasos', rows: protocols.flatMap((row) => row.steps.map((step, index) => ({ Secuencia: row.id, Orden: index + 1, Fase: step.phase, Responsable: step.role, Instrucción: step.title, Condición: step.applicability || 'Siempre', Obligatorio: step.required ? 'Sí' : 'No' }))) },
      { name: 'Ejecuciones', rows: visibleRuns.map((row) => ({ Ejecución: row.id, Secuencia: row.protocolId, Versión: row.version, Simulación: row.simulation ? 'Sí' : 'No', Estado: row.status, Ubicación: row.location, Actor: row.actorName, Inicio: row.createdAt, Cierre: row.closedAt || '', Permiso: row.orderReference, Notas: row.notes, Constancias: row.approvals, Fuentes: row.sourceFiles.join(' | ') })), images: visibleRuns.flatMap((row) => (row.photos || []).map((photo) => ({ ...photo, name: `${row.id} · ${row.location} · ${photo.name || 'Evidencia'}` }))) },
      { name: 'Bitácora de pasos', rows: visibleRuns.flatMap((run) => run.steps.map((step) => ({ Ejecución: run.id, Paso: step.title, Aplica: applicable(step, run) ? 'Sí' : 'No', Completado: step.completed ? 'Sí' : 'No', Fecha: step.at || '', Actor: step.by || '', Notas: step.notes || '' }))) },
      { name: 'Auditoría', rows: visibleRuns.flatMap((run) => (run.events || []).map((event) => ({ Ejecución: run.id, ...event }))) },
    ]); notify('Secuencias y bitácoras exportadas a Excel'); } catch (error) { notify(`No se pudo exportar: ${error.message}`); } finally { setBusy(false); }
  }
  return <div className="service-sequences-module">
    <div className="module-heading"><div><h2>Secuencias de servicio</h2><p className="muted">Protocolos, responsables, permisos y trazabilidad de cada ejecución.</p></div><div className="inline-actions"><button className="button secondary" onClick={download} disabled={busy}><Download size={16} />{busy ? 'Generando…' : 'Excel'}</button>{manager && <><button className="button secondary" onClick={() => setSettingsOpen(true)}><Settings2 size={16} />Reserva de agua</button><button className="button primary" onClick={() => setEditor({ title: '', category: 'Servicio', version: 0, sourceFiles: ['Plantilla creada por el hotel'], reviewStatus: 'draft', reviewNote: '', reviewReference: '', approvalRoles: ['Supervisor de Ingeniería'], contacts: [{ role: 'Responsable del protocolo', contact: '' }], steps: [{ id: 'PASO-1', phase: 'Antes', role: 'Supervisor de Ingeniería', title: 'Definir alcance y autorización', required: true }] })}><Plus size={17} />Nueva secuencia</button></>}</div></div>
    <div className="alert-box"><ShieldAlert size={22} /><div><strong>Plantillas sujetas a revisión del hotel</strong><p>Las fuentes se resumen sin teléfonos personales ni casos privados. Las secuencias en borrador solo permiten simulaciones. No ejecutan maniobras, llamadas, rescates ni cortes de carga.</p></div></div>
    <div className="metric-grid"><div className="metric-card"><span>Secuencias disponibles</span><strong>{protocols.length}</strong><small>Versiones editables por coordinación</small></div><div className="metric-card"><span>Pendientes de revisión</span><strong>{protocols.filter((row) => row.reviewStatus === 'draft').length}</strong><small>Contrastar con los planes vigentes</small></div><div className="metric-card"><span>Ejecuciones abiertas</span><strong>{visibleRuns.filter((row) => row.status !== 'completed').length}</strong><small>Con avance y bitácora</small></div><div className="metric-card"><span>Reserva de agua</span><strong>{settings.waterReserveAlertPercent == null ? '—' : `${settings.waterReserveAlertPercent}%`}</strong><small>{settings.waterReserveAlertPercent == null ? 'Umbral pendiente de aprobación' : 'Porcentaje remanente, no agotado'}</small></div></div>
    <div className="toolbar"><div className="module-tabs"><button className={`button ${view === 'protocols' ? 'primary' : 'secondary'} small`} onClick={() => setView('protocols')}><BookOpenCheck size={16} />Biblioteca</button><button className={`button ${view === 'runs' ? 'primary' : 'secondary'} small`} onClick={() => setView('runs')}><Clock3 size={16} />Ejecuciones e historial</button></div><input aria-label="Buscar secuencias o ejecuciones" placeholder="Buscar por nombre o ubicación…" value={query} onChange={(event) => setQuery(event.target.value)} />{view === 'protocols' && <select aria-label="Categoría de secuencia" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas las categorías</option>{[...new Set(protocols.map((row) => row.category))].map((name) => <option key={name}>{name}</option>)}</select>}</div>
    {view === 'protocols' ? <div className="module-grid">{filtered.map((protocol) => <section className="card" key={protocol.id} style={{ padding: 22 }}><div className="summary-row"><span className="badge">{protocol.category}</span><span className={`badge ${protocol.reviewStatus === 'draft' ? 'medium' : 'success'}`}>{protocol.reviewStatus === 'draft' ? 'Borrador' : 'Revisado'}</span></div><h3>{protocol.title}</h3><p className="muted">{protocol.steps.length} pasos · versión {protocol.version}</p><p>{protocol.reviewNote}</p><details><summary>Consultar pasos, responsables y fuentes</summary><ol>{protocol.steps.map((step) => <li key={step.id} style={{ marginBottom: 12 }}><strong>{step.phase} · {step.role}</strong><p>{step.title}</p></li>)}</ol><p className="muted">Fuentes: {protocol.sourceFiles.join(' · ')}</p><h4>Contactos por rol</h4>{protocol.contacts.map((contact) => <p key={contact.role}>{contact.role}: {contact.contact || 'Pendiente de configurar'}</p>)}</details><div className="inline-actions" style={{ marginTop: 18 }}><button className="button primary small" onClick={() => start(protocol)}><Play size={15} />{protocol.reviewStatus === 'draft' ? 'Iniciar simulación' : 'Activar secuencia'}</button>{manager && <button className="button secondary small" onClick={() => setEditor(protocol)}><Pencil size={15} />Editar / revisar</button>}</div></section>)}</div> : <section className="card"><div className="table-wrap"><table className="data-table"><thead><tr><th>Ejecución / secuencia</th><th>Ubicación</th><th>Inicio / responsable</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{visibleRuns.map((run) => <tr key={run.id}><td><strong>{run.title}</strong><small className="muted" style={{ display: 'block' }}>{run.id} · v{run.version} {run.simulation ? '· Simulación' : ''}</small></td><td>{run.location || 'Pendiente'}</td><td>{formatDate(run.createdAt)}<small className="muted" style={{ display: 'block' }}>{run.actorName}</small></td><td><span className={`badge ${run.status === 'completed' ? 'success' : 'medium'}`}>{run.status === 'completed' ? 'Finalizada' : 'Abierta'}</span></td><td><button className="button secondary small" onClick={() => setRunEditor(run)}>Consultar / continuar</button></td></tr>)}</tbody></table></div>{!visibleRuns.length && <div className="empty-state"><BookOpenCheck size={30} /><h3>Aún no hay ejecuciones</h3><p>Abre una secuencia de la biblioteca para iniciar una simulación.</p></div>}</section>}
    {editor && <TemplateEditor protocol={editor} user={actorUser} onClose={() => setEditor(null)} onSave={saveTemplate} />}
    {runEditor && <RunEditor run={runEditor} user={actorUser} settings={settings} onClose={() => setRunEditor(null)} onSave={saveRun} />}
    {settingsOpen && <Modal title="Alerta de reserva de agua" onClose={() => setSettingsOpen(false)}><form onSubmit={saveSettings}><p className="notice">El requisito de «70%» es ambiguo. Introduce el porcentaje de agua que permanece disponible cuando debe activarse la alerta, con aprobación del responsable. Vacío mantiene la alerta desactivada.</p><Field label="Umbral: % de reserva REMANENTE"><input type="number" min="0" max="100" step="0.1" value={reserve} onChange={(event) => setReserve(event.target.value)} placeholder="Sin configurar" /></Field><Field label="Referencia de aprobación de Gerencia"><input value={reference} maxLength={300} onChange={(event) => setReference(event.target.value)} required={reserve !== ''} placeholder="Acta / procedimiento / responsable" /></Field><div className="modal-footer"><button type="button" className="button secondary" onClick={() => setSettingsOpen(false)}>Cancelar</button><button className="button primary">Guardar configuración</button></div></form></Modal>}
  </div>;
}
