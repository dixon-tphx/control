import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer, Save, CalendarDays, Image, Info } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Field, TEAM, AREAS, uid, todayISO, formatDate, money, exportWorkbook } from '../shared';
import { chartPNG, downloadReportWord } from '../reportExport';

const COLORS = ['#101820', '#00a19a', '#dfb56c'];
const REPORT_SOURCES = ['Informe Ingeniería PCWA 20Julio-31Agosto.pdf', 'Informe de mantenimiento - Agosto .pdf', 'Proyecto Optimizacion Recurso Hídrico PCWA (1).pdf'];
const sectionTitles = ['Sistemas críticos', 'Equipos electromecánicos', 'Habitaciones', 'Infraestructura y recursos', 'Pendientes y seguimiento'];
function dayOf(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
const inPeriod = (value, from, to) => { const day = dayOf(value); return !!day && day >= from && day <= to; };
function shiftDay(dateString, days) { const date = new Date(`${dateString}T12:00:00`); date.setDate(date.getDate() + days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function bounds(month) { const [year, number] = month.split('-').map(Number); const last = new Date(year, number, 0).getDate(); return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }; }
const safePhotos = (items) => (items || []).filter((photo) => /^data:image\/(jpeg|jpg|png);base64,/i.test(photo?.url || ''));
const authorOf = (report) => report.authorName || 'Autor no registrado';
function classify(order) {
  if (/supresi|incend|gas|generador|e.?one|potable|respaldo|transformador|ats/i.test(`${order.title} ${order.fault} ${order.faultDetail}`)) return sectionTitles[0];
  if (order.roomId || order.area === 'Habitaciones') return sectionTitles[2];
  if (order.area === 'Electromecánica') return sectionTitles[1];
  return sectionTitles[3];
}

// Counts are based on dated events. Current plan dates are intentionally excluded
// from historical preventive compliance: a schedule snapshot is required for that.
export function buildReportModel(data, from, to) {
  const orders = data.orders || [];
  const created = orders.filter((order) => inPeriod(order.createdAt, from, to));
  const reports = orders.flatMap((order) => (order.reports || []).filter((report) => inPeriod(report.at, from, to)).map((report) => ({ ...report, order })));
  const findings = orders.flatMap((order) => (order.findings || []).filter((finding) => inPeriod(finding.at, from, to)).map((finding) => ({ ...finding, order })));
  const closed = orders.filter((order) => inPeriod(order.closedAt, from, to));
  const reportClosures = reports.filter((report) => report.status === 'completed');
  const preventive = (data.preventiveRuns || []).filter((run) => inPeriod(run.date, from, to));
  const rooms = (data.roomHistory || []).filter((run) => inPeriod(run.date, from, to));
  const rounds = (data.rounds || []).filter((run) => inPeriod(run.date, from, to));
  const purchases = (data.purchaseOrders || []).filter((purchase) => inPeriod(purchase.date, from, to));
  const purchaseEvents = (data.purchaseOrders || []).flatMap((purchase) => (purchase.history || []).filter((event) => inPeriod(event.at, from, to)).map((event) => ({ ...event, purchase })));
  const budget = (data.budgetEntries || []).filter((entry) => inPeriod(entry.date, from, to));
  const capex = (data.capex || []).filter((project) => inPeriod(project.updatedAt || project.createdAt || project.date, from, to));
  const relevantIds = new Set([...created, ...closed, ...reports.map((report) => report.order), ...findings.map((finding) => finding.order)].map((order) => order.id));
  const relevant = orders.filter((order) => relevantIds.has(order.id));
  const areaChart = AREAS.map((area) => ({ name: area, Creadas: created.filter((order) => order.area === area).length, Cerradas: closed.filter((order) => order.area === area).length, Reportes: reports.filter((report) => report.order.area === area).length }));
  const technicianChart = [...new Set(reportClosures.map(authorOf))].map((name) => ({ name, Cierres: reportClosures.filter((report) => authorOf(report) === name).length }));
  const maintenanceChart = [{ name: 'Preventivos', Ejecutados: preventive.length }, { name: 'Correctivos', Ejecutados: closed.length }, { name: 'Revisiones 360', Ejecutados: rooms.length }, { name: 'Recorridas', Ejecutados: rounds.length }];
  const evidence = [];
  const addPhotos = (photos, section, title, at, author) => {
    for (const photo of safePhotos(photos)) evidence.push({ ...photo, section, name: `${title} · ${formatDate(at)} · ${author || 'Autor no registrado'} · ${photo.name || 'Evidencia'}` });
  };
  for (const order of created) addPhotos(order.photos, classify(order), `${order.id} · Hallazgo inicial · ${order.title}`, order.createdAt, order.createdByName);
  for (const report of reports) addPhotos(report.photos, classify(report.order), `${report.order.id} · Reporte ${report.id || ''} · ${report.notes || report.order.title}`, report.at, authorOf(report));
  for (const finding of findings) addPhotos(finding.photos, classify(finding.order), `${finding.order.id} · Hallazgo vinculado · ${finding.description || finding.title}`, finding.at, finding.authorName);
  for (const run of preventive) addPhotos(run.photos, classify({ title: run.planTitle || run.equipment, fault: run.equipment, area: run.area }), `${run.id} · Preventivo · ${run.planTitle || run.equipment}`, run.date, run.authorName);
  for (const room of rooms) addPhotos(room.photos, sectionTitles[2], `Habitación ${room.roomNumber || room.roomId} · ${room.id}`, room.date, room.authorName);
  for (const round of rounds) addPhotos(round.photos, sectionTitles[3], `${round.building} · ${round.location} · ${round.description}`, round.date, round.authorName);
  const sectionRows = sectionTitles.map((title) => ({ title, rows: [] }));
  for (const report of reports) sectionRows.find((section) => section.title === classify(report.order)).rows.push(`${report.order.id} · ${report.order.title}: ${report.notes || 'Reporte técnico sin descripción'} · ${report.progress}% · ${formatDate(report.at)} · ${authorOf(report)}`);
  for (const order of closed.filter((order) => !reports.some((report) => report.order.id === order.id))) sectionRows.find((section) => section.title === classify(order)).rows.push(`${order.id} · ${order.title}: cierre registrado el ${formatDate(order.closedAt)}; no hay reporte técnico firmado dentro del período.`);
  for (const run of preventive) sectionRows.find((section) => section.title === (/gas|generador|supresi|seguridad|potable/i.test(run.equipment || '') ? sectionTitles[0] : run.area === 'Infraestructura' ? sectionTitles[3] : sectionTitles[1])).rows.push(`${run.id} · Preventivo: ${run.planTitle || run.equipment || run.planId} · ${formatDate(run.date)} · ${(run.checks || []).filter((check) => check.status === 'finding').length} hallazgo(s).`);
  for (const room of rooms) sectionRows[2].rows.push(`${room.id} · Revisión 360 de habitación ${room.roomNumber || room.roomId}: ${(room.checks || []).filter((check) => check.status === 'finding').length} hallazgo(s) · ${formatDate(room.date)}.`);
  for (const round of rounds) sectionRows[3].rows.push(`${round.id} · ${round.building} / ${round.location}: ${round.description} · ${formatDate(round.date)}.`);
  for (const order of relevant.filter((order) => order.status !== 'completed')) sectionRows[4].rows.push(`${order.id} · ${order.title} · avance ACTUAL ${order.progress || 0}% · responsable actual ${TEAM.find((member) => member.id === order.owner)?.name || 'Sin asignar'}.`);
  const definitions = [
    `Intervalo inclusivo ${from} a ${to}, interpretado en America/Costa_Rica. Solo se incluyen eventos con fecha dentro del intervalo.`,
    'Solicitudes creadas: fecha createdAt. Trabajos cerrados: fecha closedAt registrada. Reportes técnicos: fecha de firma at, aunque la solicitud se haya creado antes.',
    'Gráfico de técnicos: reportes técnicos con estado de cierre firmados en el período; no se atribuyen a un técnico cierres antiguos sin autor registrado. Puede haber varios reportes por trabajo.',
    'Preventivos ejecutados: revisiones guardadas, no planes programados. No se calcula cumplimiento preventivo histórico a partir de las fechas actuales del programa; se necesitan instantáneas de programación.',
    'Avance, responsable y pendientes muestran el estado actual de los trabajos que tuvieron actividad en el período, no una reconstrucción histórica al cierre.',
    'Compras solicitadas se filtran por fecha de solicitud; cambios de etapa, por su bitácora. Movimientos presupuestarios se filtran por su fecha de imputación, no por fecha de pago. CAPEX solo incluye cambios con fecha registrada.',
    `Estructura de secciones adaptada de ${REPORT_SOURCES.join(' · ')}. No se incorporan casos, fotografías privadas ni contactos de esos archivos.`,
  ];
  return { created, closed, reports, findings, reportClosures, preventive, rooms, rounds, purchases, purchaseEvents, budget, capex, relevant, areaChart, technicianChart, maintenanceChart, photos: evidence, sections: sectionRows, definitions };
}

function Chart({ rows, series, height = 270 }) {
  if (!rows.length) return <div className="empty-state">Sin eventos de este tipo en el período.</div>;
  return <div style={{ width: '100%', height, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ left: -20, right: 20, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Legend />{series.map((entry, index) => <Bar key={entry} dataKey={entry} fill={COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} />)}</BarChart></ResponsiveContainer></div>;
}

export default function ExecutiveReports({ data, setData, notify, mode = 'weekly', user, currentUser }) {
  const actor = currentUser || user;
  const today = todayISO(), monthly = mode === 'monthly';
  const initial = monthly ? bounds(today.slice(0, 7)) : { from: shiftDay(today, -6), to: today };
  const [from, setFrom] = useState(initial.from), [to, setTo] = useState(initial.to), [summary, setSummary] = useState('');
  const [busy, setBusy] = useState('');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const model = useMemo(() => buildReportModel(data, from, to), [data, from, to]);
  const saved = (data.reportSnapshots || []).filter((row) => row.mode === mode && row.from === from && row.to === to).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  useEffect(() => { setSummary(saved?.summary || ''); }, [from, to, mode, saved?.id]);
  const title = monthly ? 'Informe ejecutivo mensual' : 'Informe semanal de ingeniería';
  const metrics = [
    { label: 'Solicitudes creadas', value: model.created.length }, { label: 'Trabajos cerrados', value: model.closed.length },
    { label: 'Reportes técnicos firmados', value: model.reports.length }, { label: 'Preventivos ejecutados', value: model.preventive.length },
    { label: 'Revisiones 360', value: model.rooms.length }, { label: 'Recorridas registradas', value: model.rounds.length },
    { label: 'Fotos de evidencia', value: model.photos.length }, { label: 'Compras solicitadas', value: model.purchases.length },
  ];
  const charts = () => [
    { name: 'Actividad por área', url: chartPNG('Actividad por área', model.areaChart, [{ key: 'Creadas' }, { key: 'Cerradas' }, { key: 'Reportes' }]) },
    { name: 'Reportes de cierre por autor técnico', url: chartPNG('Reportes de cierre por autor técnico', model.technicianChart, [{ key: 'Cierres' }]) },
    { name: 'Mantenimientos y revisiones ejecutadas', url: chartPNG('Mantenimientos y revisiones ejecutadas', model.maintenanceChart, [{ key: 'Ejecutados' }]) },
  ];
  const tables = [
    { name: 'Trabajos creados', headers: ['Código', 'Trabajo', 'Área', 'Prioridad'], rows: model.created.map((row) => ({ Código: row.id, Trabajo: row.title, Área: row.area, Prioridad: row.priority, Registro: row.createdAt, Ubicación: `${row.building} · ${row.roomId || row.location || ''}`, 'Avance actual': row.progress })) },
    { name: 'Cierres registrados', headers: ['Código', 'Trabajo', 'Área', 'Cierre'], rows: model.closed.map((row) => ({ Código: row.id, Trabajo: row.title, Área: row.area, Cierre: row.closedAt, Origen: row.source, 'Horas transcurridas': Math.max(0, (new Date(row.closedAt) - new Date(row.createdAt)) / 3600000).toFixed(2) })) },
    { name: 'Reportes técnicos', headers: ['Solicitud', 'Autor', 'Fecha', 'Avance', 'Descripción'], rows: model.reports.map((row) => ({ Solicitud: row.order.id, Autor: authorOf(row), Fecha: row.at, Avance: row.progress, Descripción: row.notes, Estado: row.status, Fotos: (row.photos || []).length })) },
    { name: 'Preventivos ejecutados', rows: model.preventive.map((row) => ({ Revisión: row.id, Plan: row.planTitle || row.planId, Fecha: row.date, Edificio: row.building, Hallazgos: (row.checks || []).filter((check) => check.status === 'finding').length, Correctivos: (row.orderIds || []).join(', ') })) },
    { name: 'Revisiones 360', rows: model.rooms.map((row) => ({ Revisión: row.id, Habitación: row.roomNumber || row.roomId, Fecha: row.date, Edificio: row.building, Hallazgos: (row.checks || []).filter((check) => check.status === 'finding').length, Fotos: (row.photos || []).length })) },
    { name: 'Recorridas', rows: model.rounds.map((row) => ({ Recorrida: row.id, Fecha: row.date, Ubicación: `${row.building} · ${row.location}`, Descripción: row.description, Prioridad: row.priority, Fotos: (row.photos || []).length })) },
    { name: 'Compras solicitadas', rows: model.purchases.map((row) => ({ Compra: row.id, Solicitud: row.requestId || '', Fecha: row.date, Descripción: row.description, Cuenta: row.account, Etapa: row.stage, Importe: Number(row.amount) || 0, Moneda: data.currency || 'USD' })) },
    { name: 'Etapas de compras', rows: model.purchaseEvents.map((event) => ({ Compra: event.purchase.id, Fecha: event.at, Desde: event.from || 'Alta', Hasta: event.to, Nota: event.note || '' })) },
    { name: 'Movimientos de presupuesto', rows: model.budget.map((row) => ({ Movimiento: row.id, Fecha: row.date, Descripción: row.description, Cuenta: row.account, Etapa: row.stage, Importe: Number(row.amount) || 0, Moneda: data.currency || 'USD' })) },
    { name: 'Cambios FF&E CAPEX', rows: model.capex.map((row) => ({ Proyecto: row.id, Título: row.title, Área: row.area, Año: row.year, Fecha: row.updatedAt || row.createdAt || row.date, Estimado: Number(row.amount) || 0, Moneda: data.currency || 'USD' })) },
  ];
  function saveSummary() {
    if (!valid) return;
    const snapshot = { id: uid('INF'), mode, from, to, summary, metrics, createdAt: new Date().toISOString(), authorId: actor?.id || 'demo-coordinator', authorName: actor?.name || 'Coordinación de demostración', sourceTemplates: REPORT_SOURCES, definitions: model.definitions };
    setData((old) => ({ ...old, reportSnapshots: [snapshot, ...(old.reportSnapshots || [])] })); notify('Resumen y corte de indicadores guardados en el historial de informes');
  }
  async function download(kind) {
    if (!valid || busy) return;
    setBusy(kind);
    try {
      const chartImages = charts();
      if (kind === 'word') await downloadReportWord({ title: `${title} ${from} a ${to}`, subtitle: `Período: ${formatDate(from)} — ${formatDate(to)} · corte generado ${formatDate(today)}`, summary, definitions: model.definitions, metrics, charts: chartImages, sections: model.sections, tables, photos: model.photos, author: actor?.name || 'Coordinación de ingeniería' });
      else await exportWorkbook(`sigma-informe-${monthly ? 'mensual' : 'semanal'}-${from}-${to}`, [
        { name: 'Resumen ejecutivo', rows: [{ Informe: title, Desde: from, Hasta: to, Resumen: summary || 'Sin resumen redactado', Autor: actor?.name || 'Coordinación de ingeniería', Generado: new Date().toISOString() }, ...metrics.map((metric) => ({ Indicador: metric.label, Valor: metric.value }))] },
        { name: 'Criterios de cálculo', rows: model.definitions.map((definition) => ({ Criterio: definition })) },
        { name: 'Gráficos', rows: [{ Período: `${from} a ${to}`, Descripción: 'Gráficos incorporados como imágenes PNG. Los datos originales están en las hojas siguientes.' }], images: chartImages.map((chart, index) => ({ ...chart, row: 4 + index * 28, width: 840, height: 448 })) },
        { name: 'Datos gráficos áreas', rows: model.areaChart }, { name: 'Datos gráficos técnicos', rows: model.technicianChart }, { name: 'Datos gráficos mantenimiento', rows: model.maintenanceChart },
        { name: 'Secciones del informe', rows: model.sections.flatMap((section) => section.rows.length ? section.rows.map((row) => ({ Sección: section.title, Detalle: row })) : [{ Sección: section.title, Detalle: 'Sin movimientos fechados en el período' }]) },
        ...tables,
        { name: 'Evidencia fotográfica', rows: model.photos.map((photo, index) => ({ N: index + 1, Sección: photo.section, Descripción: photo.name })), images: model.photos.map((photo) => ({ ...photo, width: 520, height: 350 })) },
      ]);
      notify(`${kind === 'word' ? 'Word' : 'Excel'} descargado con 3 gráficos y ${model.photos.length} fotografía(s) incorporada(s)`);
    } catch (error) { notify(`No se pudo generar el informe: ${error.message}`); }
    finally { setBusy(''); }
  }
  return <div className="executive-reports-module">
    <style>{`@media print {body * {visibility:hidden !important}.report-preview,.report-preview * {visibility:visible !important}.report-preview{position:absolute !important;left:0 !important;top:0 !important;width:100% !important;max-width:none !important;background:white !important;padding:18px !important}.report-preview .card{break-inside:avoid;border:1px solid #ddd;box-shadow:none}.report-preview .report-photo{break-inside:avoid}.report-preview .report-charts{display:block}.report-preview .report-charts>.card{margin:0 0 18px}.report-preview .no-print{display:none !important}.report-preview img{max-width:100%}.report-preview h2{font-size:22px}}`}</style>
    <div className="module-heading"><div><h2>{title}</h2><p className="muted">Un corte por fechas, con ejecución real registrada, gráficos y evidencia transportable.</p></div><div className="inline-actions"><button className="button secondary" onClick={() => window.print()} disabled={!valid}><Printer size={16} />Imprimir / PDF</button><button className="button secondary" onClick={() => download('excel')} disabled={!valid || !!busy}><Download size={16} />{busy === 'excel' ? 'Generando…' : 'Excel con fotos'}</button><button className="button primary" onClick={() => download('word')} disabled={!valid || !!busy}><FileText size={16} />{busy === 'word' ? 'Generando…' : 'Word con fotos'}</button></div></div>
    <div className="card toolbar">{monthly && <Field label="Mes del informe"><input type="month" value={from.slice(0, 7)} onChange={(event) => { if (event.target.value) { const dates = bounds(event.target.value); setFrom(dates.from); setTo(dates.to); } }} /></Field>}<Field label="Desde"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="Hasta"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field><span className="muted"><CalendarDays size={16} /> Intervalo inclusivo · Costa Rica</span></div>
    {!valid && <p className="alert-box" role="alert">Selecciona un intervalo válido: la fecha inicial no puede ser posterior a la final.</p>}
    <section className="card" style={{ padding: 22, marginBottom: 22 }}><div className="card-header" style={{ padding: 0, marginBottom: 14 }}><div><h3>Resumen redactado por Ingeniería</h3><p className="muted">El texto se incorpora en la vista previa, Word y Excel. Guardar conserva un corte de indicadores y el resumen.</p></div><button className="button secondary small" onClick={saveSummary} disabled={!valid}><Save size={15} />Guardar resumen y corte</button></div><Field label="Resumen ejecutivo del período"><textarea rows={5} maxLength={16000} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Describe avances, incidencias relevantes, riesgos, decisiones y próximos pasos…" /></Field>{saved && <p className="muted">Último resumen guardado: {formatDate(saved.createdAt)} · {saved.authorName}. Los gráficos que se muestran abajo se calculan con los datos actuales.</p>}</section>
    <div className="report-preview">
      <header className="card" style={{ padding: 24, marginBottom: 20 }}><p className="eyebrow">SIGMA · DEPARTAMENTO DE INGENIERÍA</p><h2>{title}</h2><p>{formatDate(from)} — {formatDate(to)}</p><p className="muted">Preparado por {actor?.name || 'Coordinación de ingeniería'} · información registrada en el sistema</p><h3>Resumen ejecutivo</h3><p style={{ whiteSpace: 'pre-wrap' }}>{summary || 'El resumen ejecutivo aún no ha sido redactado.'}</p></header>
      <div className="metric-grid">{metrics.map((metric) => <div className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>Dentro del período seleccionado</small></div>)}</div>
      <div className="module-grid report-charts"><section className="card chart-card"><h3>Actividad por área</h3><Chart rows={model.areaChart} series={['Creadas', 'Cerradas', 'Reportes']} /></section><section className="card chart-card"><h3>Reportes de cierre por autor técnico</h3><Chart rows={model.technicianChart} series={['Cierres']} /></section><section className="card chart-card"><h3>Mantenimiento y revisiones ejecutadas</h3><Chart rows={model.maintenanceChart} series={['Ejecutados']} /></section></div>
      <section className="card" style={{ padding: 22, margin: '20px 0' }}><h3>Definiciones del corte</h3><div className="notice"><Info size={18} /><p>No se presenta el programa actual como cumplimiento preventivo histórico. Se muestran las revisiones realmente guardadas y los eventos fechados.</p></div><ul>{model.definitions.slice(0, -1).map((line) => <li key={line} style={{ marginBottom: 10 }}>{line}</li>)}</ul></section>
      {model.sections.map((section) => <section className="card" key={section.title} style={{ padding: 22, marginBottom: 20 }}><h3>{section.title}</h3>{section.rows.length ? <ul>{section.rows.map((row, index) => <li key={index} style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{row}</li>)}</ul> : <p className="muted">Sin movimientos fechados en el período.</p>}</section>)}
      <section className="card" style={{ marginBottom: 20 }}><div className="card-header"><div><h3 className="card-title">Compras, recursos y proyección</h3><p className="muted">Fechas de solicitud, cambios de etapa y movimientos del período, sin duplicar órdenes y presupuesto.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Concepto</th><th>Registros</th><th>Importe</th><th>Criterio</th></tr></thead><tbody><tr><td>Solicitudes de compra</td><td>{model.purchases.length}</td><td>{money(model.purchases.reduce((sum, row) => sum + Number(row.amount || 0), 0), data.currency || 'USD')}</td><td>Fecha de solicitud; no equivale a gasto pagado</td></tr><tr><td>Cambios de etapa en compras</td><td>{model.purchaseEvents.length}</td><td>—</td><td>Fecha de evento en bitácora</td></tr><tr><td>Movimientos presupuestarios</td><td>{model.budget.length}</td><td>{money(model.budget.filter((row) => row.stage !== 'requested').reduce((sum, row) => sum + Number(row.amount || 0), 0), data.currency || 'USD')}</td><td>Pagado + comprometido, según fecha de imputación</td></tr><tr><td>Actualizaciones FF&E / CAPEX</td><td>{model.capex.length}</td><td>{money(model.capex.reduce((sum, row) => sum + Number(row.amount || 0), 0), data.currency || 'USD')}</td><td>Solo proyectos con fecha de cambio registrada</td></tr></tbody></table></div><p className="muted" style={{ padding: '0 22px 18px' }}>Las proyecciones sin fecha de alta / cambio no se atribuyen artificialmente a esta semana o mes. Las compras son una vista del origen; no se suman nuevamente sobre los movimientos presupuestarios.</p></section>
      <section className="card" style={{ padding: 22 }}><div className="summary-row"><h3>Evidencia por sección</h3><span className="badge"><Image size={14} />{model.photos.length} fotografías</span></div>{model.photos.length ? sectionTitles.map((section) => {
        const photos = model.photos.filter((photo) => photo.section === section);
        return photos.length ? <div key={section}><h4>{section}</h4><div className="module-grid">{photos.map((photo, index) => <figure className="report-photo" key={`${photo.id}-${index}`} style={{ margin: '0 0 20px' }}><img src={photo.url} alt={photo.name} style={{ width: '100%', maxHeight: 360, objectFit: 'contain', background: '#f4f6f8', borderRadius: 10 }} /><figcaption className="muted" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{photo.name}</figcaption></figure>)}</div></div> : null;
      }) : <div className="empty-state"><Image size={30} /><h4>Sin fotos fechadas en el intervalo</h4><p>Agrega evidencia en reportes técnicos, revisiones 360 o recorridas. Se incorporará automáticamente al informe correspondiente.</p></div>}</section>
      <p className="muted" style={{ marginTop: 18 }}>{model.definitions.at(-1)}</p>
    </div>
  </div>;
}
