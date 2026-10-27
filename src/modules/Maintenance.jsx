import { useMemo, useState } from 'react';
import { Plus, ClipboardCheck, CalendarDays, AlertTriangle, Download, Pencil, CheckCircle2, Wrench, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { TEAM, AREAS, BUILDINGS, Modal, Field, exportWorkbook, uid, todayISO, formatDate } from '../shared';

const frequencies = { weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral', annual: 'Anual' };
const equipmentTemplates = [
  { equipment: 'Equipos de gas', checks: ['Estado visual de conexiones y señalización', 'Registro de revisión de fugas por personal autorizado', 'Ventilación y acceso despejados', 'Vigencia del mantenimiento especializado'] },
  { equipment: 'Aire acondicionado', checks: ['Estado de filtros y limpieza', 'Drenajes sin obstrucciones', 'Temperatura y funcionamiento registrados', 'Vibración, ruido y estado de aislamiento'] },
  { equipment: 'Cámaras de refrigeración', checks: ['Temperatura registrada dentro del rango del equipo', 'Empaques y cierre de puertas', 'Evaporador, drenaje y limpieza', 'Alarmas y señalización verificadas'] },
  { equipment: 'Bombas de cárcamo', checks: ['Estado visual y acceso seguro', 'Registro de funcionamiento automático', 'Sensores de nivel y alarmas', 'Ruido, vibración y fugas visibles'] },
  { equipment: 'Máquinas de hielo', checks: ['Limpieza y condición sanitaria', 'Estado del filtro de agua', 'Producción y temperatura registradas', 'Drenajes y ausencia de fugas'] },
  { equipment: 'Bombas de piscina', checks: ['Presión y caudal registrados', 'Estado de filtros y prefiltros', 'Sellos sin fugas visibles', 'Ruido, vibración y protecciones'] },
  { equipment: 'Tableros eléctricos', checks: ['Señalización y acceso despejados', 'Gabinete, tapas y cierres en buen estado', 'Registro de revisión por personal autorizado', 'Evidencia visual de humedad o sobrecalentamiento'] },
  { equipment: 'Equipos de lavandería', checks: ['Filtros y ductos conforme programa', 'Mangueras y conexiones sin fugas visibles', 'Ciclo de operación registrado', 'Protecciones y paros de seguridad verificados'] },
  { equipment: 'Sistemas críticos de seguridad', infrastructure: true, checks: ['Rutas de evacuación y señalización', 'Puertas cortafuego y autocierre', 'Iluminación de emergencia', 'Registro de pruebas de alarmas por personal autorizado'] },
  { equipment: 'Sistema de supresión', frequency: 'weekly', checks: ['Prueba semanal registrada conforme procedimiento autorizado', 'Válvulas y señalización en posición documentada', 'Registro de presión y estado de alarmas', 'Observaciones y firma del responsable autorizado'] },
  { equipment: 'Generadores', frequency: 'weekly', checks: ['Prueba semanal registrada conforme fabricante', 'Niveles y estado visual sin fugas', 'Registro de batería y alarmas', 'Registro de transferencia según procedimiento autorizado'] },
  { equipment: 'Infraestructura del edificio', infrastructure: true, checks: ['Cubiertas y desagües', 'Muros, cielos y acabados', 'Puertas, ventanas y herrajes', 'Accesibilidad y condiciones de áreas comunes'] },
];

function normalize(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function engineeringArea(infrastructure = false) {
  return AREAS.find((area) => normalize(area).includes(infrastructure ? 'infraestructura' : 'electromecan')) || AREAS[0] || 'Electromecánica';
}
function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function offsetDate(days) {
  const date = new Date(`${todayISO()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}
function nextScheduledDate(dateString, frequency) {
  const date = new Date(`${dateString}T12:00:00`);
  if (frequency === 'weekly') date.setDate(date.getDate() + 7);
  else {
    const months = frequency === 'annual' ? 12 : frequency === 'quarterly' ? 3 : 1;
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, end));
  }
  return isoDate(date);
}

export function seedMaintenance() {
  return {
    preventivePlans: equipmentTemplates.map((template, index) => ({
      id: `PM-${String(index + 1).padStart(3, '0')}`,
      title: `${template.frequency === 'weekly' ? 'Prueba semanal' : 'Revisión preventiva'} · ${template.equipment}`,
      equipment: template.equipment,
      area: engineeringArea(template.infrastructure),
      building: BUILDINGS[index % BUILDINGS.length] || 'Edificio A',
      frequency: template.frequency || 'monthly',
      nextDate: offsetDate(index < 2 ? -2 : index === 2 ? 0 : index + 1),
      checks: [...template.checks],
    })),
    preventiveRuns: [],
  };
}

function PlanEditor({ plan, onClose, onSave }) {
  const [form, setForm] = useState({ ...plan, checkText: plan.checks.join('\n') });
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  function submit(event) {
    event.preventDefault();
    const checks = form.checkText.split('\n').map((value) => value.trim()).filter(Boolean);
    if (form.title.trim().length < 3 || !checks.length) { setError('Escribe un título y al menos un punto de revisión.'); return; }
    if (!form.nextDate || form.nextDate < '2000-01-01' || form.nextDate > '2100-12-31') { setError('Selecciona una fecha válida para la próxima revisión.'); return; }
    const { checkText, ...values } = form;
    onSave({ ...values, title: form.title.trim(), equipment: form.equipment.trim(), checks });
  }
  return <Modal title={plan.id ? 'Editar plan preventivo' : 'Nuevo plan preventivo'} onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="maintenance-form-content">
        <div className="form-grid">
          <Field label="Nombre del plan"><input value={form.title} onChange={set('title')} required minLength={3} maxLength={140} placeholder="Ej. Revisión mensual de bombas" /></Field>
          <Field label="Equipo o sistema"><select value={form.equipment} onChange={(event) => { const template = equipmentTemplates.find((entry) => entry.equipment === event.target.value); setForm((old) => ({ ...old, equipment: event.target.value, ...(template ? { checkText: template.checks.join('\n'), area: engineeringArea(template.infrastructure), frequency: template.frequency || 'monthly' } : {}) })); }}>{equipmentTemplates.map((entry) => <option key={entry.equipment}>{entry.equipment}</option>)}</select></Field>
          <Field label="Área responsable"><select value={form.area} onChange={set('area')}>{AREAS.map((area) => <option key={area}>{area}</option>)}</select></Field>
          <Field label="Edificio"><select value={form.building} onChange={set('building')}>{BUILDINGS.map((building) => <option key={building}>{building}</option>)}</select></Field>
          <Field label="Frecuencia"><select value={form.frequency} onChange={set('frequency')}>{Object.entries(frequencies).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          <Field label="Próxima revisión"><input type="date" value={form.nextDate} onChange={set('nextDate')} min="2000-01-01" max="2100-12-31" required /></Field>
        </div>
        <Field label="Puntos del checklist · uno por línea"><textarea rows={6} value={form.checkText} onChange={set('checkText')} required maxLength={8000} /></Field>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
      <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">Guardar plan</button></div>
    </form>
  </Modal>;
}

function InspectionEditor({ plan, onClose, onSave }) {
  const [date, setDate] = useState(todayISO());
  const [checks, setChecks] = useState(plan.checks.map((label) => ({ label, status: '', note: '', significant: false, priority: 'medium' })));
  const [error, setError] = useState('');
  function change(index, key, value) {
    setChecks((old) => old.map((item, i) => i === index ? { ...item, [key]: value, ...(key === 'status' && value !== 'finding' ? { significant: false } : {}) } : item));
  }
  function submit(event) {
    event.preventDefault();
    if (checks.some((item) => !item.status)) { setError('Evalúa todos los puntos del checklist antes de guardar.'); return; }
    if (checks.some((item) => item.status === 'finding' && item.note.trim().length < 3)) { setError('Describe cada hallazgo con al menos 3 caracteres.'); return; }
    if (!date || date > todayISO() || date < '2000-01-01') { setError('La revisión debe tener una fecha válida que no sea futura.'); return; }
    onSave({ date, checks: checks.map((item) => ({ ...item, note: item.note.trim() })) });
  }
  const marked = checks.filter((item) => item.status).length;
  const significant = checks.filter((item) => item.status === 'finding' && item.significant).length;
  return <Modal title="Ejecutar revisión preventiva" onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="maintenance-form-content">
        <h3>{plan.title}</h3><p className="muted">{plan.building} · {plan.area} · {frequencies[plan.frequency]}</p>
        <Field label="Fecha de revisión"><input type="date" value={date} min="2000-01-01" max={todayISO()} onChange={(event) => setDate(event.target.value)} required /></Field>
        <div className="summary-row"><strong>{marked} / {checks.length} puntos revisados</strong><span>{significant} correctivos por generar</span></div>
        <div className="checklist">{checks.map((item, index) => <div className="check-row" key={`${index}-${item.label}`}>
          <div className="check-row-heading"><strong>{index + 1}. {item.label}</strong><select aria-label={`Resultado ${index + 1}`} value={item.status} onChange={(event) => change(index, 'status', event.target.value)} required><option value="">Sin revisar</option><option value="ok">Conforme</option><option value="finding">Con hallazgo</option><option value="na">No aplica</option></select></div>
          {item.status === 'finding' && <div className="finding-fields"><Field label="Descripción del hallazgo"><textarea value={item.note} onChange={(event) => change(index, 'note', event.target.value)} placeholder="Ubicación, condición observada y acción necesaria" minLength={3} maxLength={1600} rows={2} required /></Field><label className="checkbox-field"><input type="checkbox" checked={item.significant} onChange={(event) => change(index, 'significant', event.target.checked)} />Hallazgo significativo: crear trabajo correctivo</label>{item.significant && <Field label="Prioridad del correctivo"><select value={item.priority} onChange={(event) => change(index, 'priority', event.target.value)}><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></Field>}</div>}
          {item.status === 'na' && <Field label="Motivo de no aplicación"><input value={item.note} onChange={(event) => change(index, 'note', event.target.value)} placeholder="Opcional" maxLength={500} /></Field>}
        </div>)}</div>
        <p className="notice">Los hallazgos significativos se enviarán al plan correctivo al guardar. La próxima revisión se programará desde esta fecha, según la frecuencia del plan.</p>
        {error && <p role="alert" className="field-error">{error}</p>}
      </div>
      <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button primary"><ClipboardCheck size={16} />Guardar revisión</button></div>
    </form>
  </Modal>;
}

function RunDetail({ run, plan, onClose }) {
  const labels = { ok: 'Conforme', finding: 'Hallazgo', na: 'No aplica' };
  return <Modal title="Historial de revisión" onClose={onClose} wide><div className="maintenance-form-content"><h3>{run.planTitle || plan?.title || 'Plan preventivo'}</h3><p className="muted">{run.building || plan?.building} · {formatDate(run.date)} · {run.id}</p><div className="checklist">{run.checks.map((item, index) => <div className="check-row" key={index}><div className="check-row-heading"><strong>{index + 1}. {item.label}</strong><span className={`badge ${item.status === 'ok' ? 'success' : item.status === 'finding' ? 'danger' : ''}`}>{labels[item.status]}</span></div>{item.note && <p>{item.note}</p>}{item.significant && <span className="badge high">Significativo · correctivo generado</span>}</div>)}</div>{run.orderIds?.length > 0 && <div className="notice"><strong>Solicitudes correctivas vinculadas</strong><p>{run.orderIds.join(' · ')}</p><p>Disponibles en el módulo Correctivo para asignación y seguimiento.</p></div>}</div><div className="modal-footer"><button className="button primary" onClick={onClose}>Cerrar</button></div></Modal>;
}

export default function Maintenance({ data, setData, notify }) {
  const plans = data.preventivePlans || [];
  const runs = data.preventiveRuns || [];
  const [building, setBuilding] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [view, setView] = useState('plans');
  const [editor, setEditor] = useState(null);
  const [inspecting, setInspecting] = useState(null);
  const [detail, setDetail] = useState(null);
  const today = todayISO();
  const filteredPlans = plans.filter((plan) => (building === 'all' || plan.building === building) && (equipment === 'all' || plan.equipment === equipment));
  const filteredRuns = runs.filter((run) => {
    const plan = plans.find((entry) => entry.id === run.planId);
    return (building === 'all' || (run.building || plan?.building) === building) && (equipment === 'all' || (run.equipment || plan?.equipment) === equipment);
  });
  const due = filteredPlans.filter((plan) => plan.nextDate < today).length;
  const dueToday = filteredPlans.filter((plan) => plan.nextDate === today).length;
  const current = filteredPlans.length - due - dueToday;
  const weekly = filteredPlans.filter((plan) => plan.frequency === 'weekly').length;
  const chart = useMemo(() => BUILDINGS.map((name) => {
    const buildingPlans = filteredPlans.filter((plan) => plan.building === name);
    return { name, 'Programados': buildingPlans.filter((plan) => plan.nextDate > today).length, 'Hoy': buildingPlans.filter((plan) => plan.nextDate === today).length, 'Vencidos': buildingPlans.filter((plan) => plan.nextDate < today).length };
  }).filter((item) => item.Programados + item.Hoy + item.Vencidos > 0), [filteredPlans, today]);

  const newPlan = () => setEditor({ title: '', equipment: equipmentTemplates[0].equipment, area: engineeringArea(), building: BUILDINGS[0] || 'Edificio A', frequency: 'monthly', nextDate: todayISO(), checks: [...equipmentTemplates[0].checks] });
  function savePlan(plan) {
    const saved = { ...plan, id: plan.id || uid('PM') };
    setData((old) => ({ ...old, preventivePlans: plan.id ? (old.preventivePlans || []).map((entry) => entry.id === saved.id ? saved : entry) : [...(old.preventivePlans || []), saved] }));
    setEditor(null); notify(plan.id ? 'Plan preventivo actualizado' : 'Plan preventivo creado');
  }
  function saveInspection(result) {
    const runId = uid('REV');
    const at = new Date().toISOString();
    const significantChecks = result.checks.filter((item) => item.status === 'finding' && item.significant);
    const assigned = TEAM.find((member) => member.area === inspecting.area)?.id || '';
    const correctives = significantChecks.map((item) => ({
      id: uid('OT'), title: `${inspecting.equipment}: ${item.label}`.slice(0, 140),
      description: `${item.note}\nOrigen: revisión ${runId} del ${result.date}. Plan: ${inspecting.title}.`,
      area: inspecting.area, building: inspecting.building, roomId: '', location: inspecting.equipment,
      faultDetail: item.label, owner: assigned,
      priority: item.priority, status: 'pending', progress: 0, fault: inspecting.equipment,
      createdAt: at, startedAt: null, closedAt: null, source: 'preventive', preventiveRunId: runId,
    }));
    const run = { id: runId, planId: inspecting.id, planTitle: inspecting.title, building: inspecting.building, equipment: inspecting.equipment, area: inspecting.area, date: result.date, checks: result.checks, significant: significantChecks.length, orderIds: correctives.map((item) => item.id), createdAt: at };
    const nextDate = nextScheduledDate(result.date, inspecting.frequency);
    setData((old) => ({ ...old, preventiveRuns: [run, ...(old.preventiveRuns || [])], preventivePlans: (old.preventivePlans || []).map((plan) => plan.id === inspecting.id && (!plan.lastDate || result.date > plan.lastDate) ? { ...plan, lastDate: result.date, nextDate } : plan), orders: [...correctives, ...(old.orders || [])] }));
    setInspecting(null); notify(correctives.length ? `Revisión guardada · ${correctives.length} trabajo(s) correctivo(s) creado(s)` : 'Revisión guardada y próxima fecha programada');
  }
  async function exportData() {
    try {
      await exportWorkbook(`mantenimiento-preventivo-${today}`, [
        { name: 'Programa preventivo', rows: filteredPlans.map((plan) => ({ Código: plan.id, Plan: plan.title, Equipo: plan.equipment, Área: plan.area, Edificio: plan.building, Frecuencia: frequencies[plan.frequency], Próxima: plan.nextDate, Última: plan.lastDate || '', Estado: plan.nextDate < today ? 'Vencido' : plan.nextDate === today ? 'Hoy' : 'Programado', Checklist: plan.checks.join(' | ') })) },
        { name: 'Revisiones realizadas', rows: filteredRuns.map((run) => ({ Código: run.id, Plan: run.planTitle || plans.find((entry) => entry.id === run.planId)?.title || run.planId, Fecha: run.date, Edificio: run.building, Equipo: run.equipment, Hallazgos: run.checks.filter((item) => item.status === 'finding').length, Significativos: run.significant || 0, Correctivos: (run.orderIds || []).join(', ') })) },
        { name: 'Detalle checklist', rows: filteredRuns.flatMap((run) => run.checks.map((item) => ({ Revisión: run.id, Fecha: run.date, Punto: item.label, Resultado: { ok: 'Conforme', finding: 'Hallazgo', na: 'No aplica' }[item.status], Nota: item.note, Significativo: item.significant ? 'Sí' : 'No', Prioridad: item.significant ? { high: 'Alta', medium: 'Media', low: 'Baja' }[item.priority] : '' }))) },
      ]);
      notify('Archivo Excel de mantenimiento generado');
    } catch { notify('No se pudo exportar. Intenta nuevamente.'); }
  }

  return <div className="maintenance-module">
    <div className="module-heading"><div><h2>Mantenimiento preventivo</h2><p className="muted">Infraestructura y electromecánica, equipo por equipo y edificio por edificio.</p></div><div className="inline-actions"><button className="button secondary" onClick={exportData}><Download size={16} />Excel</button><button className="button primary" onClick={newPlan}><Plus size={17} />Nuevo plan</button></div></div>
    <div className="metric-grid"><div className="metric-card"><span>Planes programados</span><strong>{filteredPlans.length}</strong><small>{weekly} con frecuencia semanal</small></div><div className="metric-card"><span>Revisiones vencidas</span><strong>{due}</strong><small>{dueToday} para hoy</small></div><div className="metric-card"><span>Revisiones registradas</span><strong>{filteredRuns.length}</strong><small>Historial de este dispositivo</small></div><div className="metric-card"><span>Hallazgos significativos</span><strong>{filteredRuns.reduce((sum, run) => sum + (run.significant || 0), 0)}</strong><small>Vinculados al plan correctivo</small></div></div>
    {(due > 0 || dueToday > 0) && <div className="alert-box"><AlertTriangle size={20} /><div><strong>{due} revisión(es) vencida(s) · {dueToday} para hoy</strong><p>Prioriza estas revisiones y registra el checklist al finalizar.</p></div></div>}
    <section className="card chart-card"><div className="card-header"><div><h3 className="card-title">Estado del programa por edificio</h3><p className="card-subtitle">Se compara la próxima fecha programada con hoy; no representa certificación técnica.</p></div></div>{chart.length ? <div style={{ width: '100%', height: 220, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="Programados" fill="#5367ed" stackId="schedule" radius={[0, 0, 0, 0]} /><Bar dataKey="Hoy" fill="#f5b957" stackId="schedule" /><Bar dataKey="Vencidos" fill="#ed7181" stackId="schedule" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="empty-state">No hay planes para estos filtros.</div>}<div className="chart-legend"><span><i style={{ background: '#5367ed' }} />Programados: {current}</span><span><i style={{ background: '#f5b957' }} />Hoy: {dueToday}</span><span><i style={{ background: '#ed7181' }} />Vencidos: {due}</span></div></section>
    <section className="card">
      <div className="card-header"><div className="module-tabs"><button className={`button ${view === 'plans' ? 'primary' : 'ghost'} small`} onClick={() => setView('plans')}>Programa ({filteredPlans.length})</button><button className={`button ${view === 'history' ? 'primary' : 'ghost'} small`} onClick={() => setView('history')}>Historial ({filteredRuns.length})</button></div></div>
      <div className="toolbar"><Field label="Edificio"><select value={building} onChange={(event) => setBuilding(event.target.value)}><option value="all">Todos los edificios</option>{BUILDINGS.map((entry) => <option key={entry}>{entry}</option>)}</select></Field><Field label="Equipo o sistema"><select value={equipment} onChange={(event) => setEquipment(event.target.value)}><option value="all">Todos los equipos</option>{[...new Set(plans.map((plan) => plan.equipment))].map((entry) => <option key={entry}>{entry}</option>)}</select></Field>{(building !== 'all' || equipment !== 'all') && <button className="button ghost small" onClick={() => { setBuilding('all'); setEquipment('all'); }}>Limpiar filtros</button>}</div>
      {view === 'plans' ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Plan / equipo</th><th>Edificio / área</th><th>Frecuencia</th><th>Próxima revisión</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filteredPlans.map((plan) => <tr key={plan.id}><td><strong>{plan.equipment}</strong><div className="muted">{plan.id} · {plan.checks.length} puntos</div></td><td>{plan.building}<div className="muted">{plan.area}</div></td><td>{frequencies[plan.frequency]}</td><td>{formatDate(plan.nextDate)}{plan.lastDate && <div className="muted">Última: {formatDate(plan.lastDate)}</div>}</td><td><span className={`badge ${plan.nextDate < today ? 'danger' : plan.nextDate === today ? 'high' : 'success'}`}>{plan.nextDate < today ? 'Vencido' : plan.nextDate === today ? 'Para hoy' : 'Programado'}</span></td><td><div className="inline-actions"><button className="button secondary small" onClick={() => setInspecting(plan)}><ClipboardCheck size={15} />Revisar</button><button className="icon-button" aria-label={`Editar ${plan.equipment}`} onClick={() => setEditor(plan)}><Pencil size={15} /></button></div></td></tr>)}</tbody></table>{!filteredPlans.length && <div className="empty-state"><CalendarDays size={28} /><h3>No hay planes para estos filtros</h3><p>Crea un plan o cambia los filtros para continuar.</p></div>}</div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Revisión</th><th>Equipo / edificio</th><th>Fecha</th><th>Hallazgos</th><th>Correctivos</th><th>Detalle</th></tr></thead><tbody>{filteredRuns.map((run) => <tr key={run.id}><td><strong>{run.id}</strong></td><td>{run.equipment || plans.find((entry) => entry.id === run.planId)?.equipment}<div className="muted">{run.building}</div></td><td>{formatDate(run.date)}</td><td>{run.checks.filter((item) => item.status === 'finding').length}</td><td>{(run.orderIds || []).length}</td><td><button className="button ghost small" onClick={() => setDetail(run)}>Ver revisión<ChevronRight size={14} /></button></td></tr>)}</tbody></table>{!filteredRuns.length && <div className="empty-state"><ClipboardCheck size={28} /><h3>Aún no hay revisiones registradas</h3><p>Ejecuta un checklist del programa para crear su historial.</p></div>}</div>}
    </section>
    <div className="notice"><Wrench size={17} /><p>Los puntos son una plantilla de demostración editable. Las pruebas de gas, electricidad, supresión y generación deben seguir los procedimientos del hotel y ser realizadas por personal autorizado.</p></div>
    {editor && <PlanEditor plan={editor} onClose={() => setEditor(null)} onSave={savePlan} />}
    {inspecting && <InspectionEditor plan={inspecting} onClose={() => setInspecting(null)} onSave={saveInspection} />}
    {detail && <RunDetail run={detail} plan={plans.find((entry) => entry.id === detail.planId)} onClose={() => setDetail(null)} />}
  </div>;
}
