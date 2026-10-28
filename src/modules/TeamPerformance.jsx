import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, Download, ShieldCheck, Users, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TEAM, AREAS, Field, exportWorkbook, todayISO } from '../shared';

const COLORS = ['#5367ed', '#37a787', '#edb254', '#a37bea', '#41a4c7', '#e58d9d'];
const STATUS = { pending: 'Pendiente', progress: 'En proceso', completed: 'Cerrada' };
const number = (value, digits = 1) => Number.isFinite(value) ? new Intl.NumberFormat('es-CR', { maximumFractionDigits: digits }).format(value) : '—';

function localDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}`;
}

function duration(order, execution = false) {
  if (order.status !== 'completed' || !order.closedAt) return null;
  const start = execution ? order.startedAt : order.createdAt;
  if (!start) return null;
  const value = (new Date(order.closedAt).getTime() - new Date(start).getTime()) / 3600000;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const average = (values) => {
  const valid = values.filter((value) => value != null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

export function getTeamPerformance(orders, { from = '', to = '', area = 'all' } = {}) {
  const filtered = orders.filter((order) => {
    const date = localDate(order.createdAt);
    return (!from || date && date >= from) && (!to || date && date <= to) && (area === 'all' || order.area === area);
  });
  const people = TEAM.filter((member) => area === 'all' || member.area === area).map((member) => {
    const jobs = filtered.filter((order) => order.owner === member.id);
    const closed = jobs.filter((order) => order.status === 'completed');
    return {
      id: member.id, name: member.name, shortName: member.name.split(' ')[0], area: member.area,
      assigned: jobs.length, closed: closed.length, active: jobs.length - closed.length,
      closureRate: jobs.length ? closed.length / jobs.length * 100 : null,
      averageResolution: average(jobs.map((order) => duration(order))),
      averageExecution: average(jobs.map((order) => duration(order, true))),
      resolutionCount: jobs.filter((order) => duration(order) != null).length,
      progress: average(jobs.map((order) => Number.isFinite(Number(order.progress)) ? Number(order.progress) : null)),
    };
  });
  return { filtered, people };
}

export default function TeamPerformance({ data, user }) {
  const role = user ? user.role : 'admin';
  const permitted = ['admin', 'coordinator'].includes(role);
  const today = todayISO();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [area, setArea] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const invalidRange = Boolean(from && to && from > to);
  const result = useMemo(() => getTeamPerformance(data.orders || [], { from, to, area }), [data.orders, from, to, area]);
  const { filtered, people } = result;
  const assigned = filtered.filter((order) => Boolean(order.owner));
  const closed = assigned.filter((order) => order.status === 'completed');
  const unassigned = filtered.length - assigned.length;
  const unknown = assigned.filter((order) => !TEAM.some((member) => member.id === order.owner));
  const meanResolution = average(closed.map((order) => duration(order)));
  const closedWithTime = closed.filter((order) => duration(order) != null).length;
  const byArea = AREAS.map((name) => {
    const jobs = filtered.filter((order) => order.area === name);
    return { name, Activos: jobs.filter((order) => order.status !== 'completed').length, Cerrados: jobs.filter((order) => order.status === 'completed').length };
  }).filter((entry) => entry.Activos + entry.Cerrados > 0);
  const typeGroups = new Map();
  filtered.forEach((order) => {
    const type = order.fault?.trim() || 'Sin clasificar';
    const group = typeGroups.get(type) || { name: type, value: 0, active: 0 };
    group.value += 1;
    if (order.status !== 'completed') group.active += 1;
    typeGroups.set(type, group);
  });
  const types = [...typeGroups.values()].sort((a, b) => b.value - a.value);
  const chartTypes = types.length > 6 ? [...types.slice(0, 5), { name: 'Otros tipos', value: types.slice(5).reduce((sum, item) => sum + item.value, 0) }] : types;

  const download = async () => {
    setExporting(true); setExportError('');
    try {
      await exportWorkbook(`rendimiento-equipo-${from || 'inicio'}-${to || 'hoy'}`, [
        { name: 'Rendimiento por persona', rows: people.map((member) => ({ Responsable: member.name, Área: member.area, 'Trabajos asignados': member.assigned, Activos: member.active, Cerrados: member.closed, 'Tasa de cierre %': member.closureRate, 'Avance medio %': member.progress, 'Horas medias de resolución': member.averageResolution, 'Cierres con duración válida': member.resolutionCount, 'Horas medias de ejecución': member.averageExecution, Desde: from, Hasta: to, Criterio: 'Fecha de creación · America/Costa_Rica' })) },
        { name: 'Detalle de trabajos', rows: filtered.map((order) => ({ Solicitud: order.id, Trabajo: order.title, Área: order.area, Responsable: TEAM.find((member) => member.id === order.owner)?.name || (order.owner ? 'Responsable no reconocido' : 'Sin asignar'), Estado: STATUS[order.status] || order.status, 'Avance %': order.progress, 'Tipo de avería': order.fault || 'Sin clasificar', Registro: order.createdAt, Inicio: order.startedAt || '', Cierre: order.closedAt || '', 'Horas resolución': duration(order), 'Horas ejecución': duration(order, true) })) },
        { name: 'Carga por tipo', rows: types.map((type) => ({ Tipo: type.name, Trabajos: type.value, Activos: type.active, Cerrados: type.value - type.active })) },
      ]);
    } catch { setExportError('No se pudo generar el Excel. Intenta nuevamente.'); }
    finally { setExporting(false); }
  };

  if (!permitted) return <section className="card empty-state"><ShieldCheck size={32} /><h2>Rendimiento del equipo</h2><p>Este panel está disponible para coordinación y administración.</p></section>;

  return <div className="team-performance-module">
    <div className="module-heading"><div><p className="eyebrow">COORDINACIÓN · INDICADORES DEL EQUIPO</p><h2>Un equipo que avanza.</h2><p className="muted">Carga de trabajo, cierres y tiempos de atención por responsable y área técnica.</p></div><button className="button secondary" onClick={download} disabled={exporting || invalidRange || !filtered.length}><Download size={16} />{exporting ? 'Generando…' : 'Exportar Excel'}</button></div>
    <div className="toolbar"><Field label="Creación desde"><input type="date" min="2000-01-01" max="2100-12-31" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="Creación hasta"><input type="date" min="2000-01-01" max="2100-12-31" value={to} onChange={(event) => setTo(event.target.value)} /></Field><Field label="Área del trabajo"><select value={area} onChange={(event) => setArea(event.target.value)}><option value="all">Todas las áreas</option>{AREAS.map((name) => <option key={name}>{name}</option>)}</select></Field><button className="button ghost small" onClick={() => { setFrom(''); setTo(''); setArea('all'); }}>Ver todo el historial</button></div>
    {invalidRange && <p className="field-error" role="alert">La fecha inicial no puede ser posterior a la fecha final.</p>}
    {exportError && <p className="field-error" role="alert">{exportError}</p>}
    <p className="notice">El rango filtra la <strong>fecha de creación</strong> del trabajo en hora de Costa Rica. Los resultados reflejan el estado y el responsable actuales; no cuentan solamente los cierres ocurridos durante el período.</p>
    <div className="metric-grid"><article className="metric-card"><Users size={20} /><span>Trabajos asignados</span><strong>{assigned.length}</strong><small>{unassigned} pendientes de asignación</small></article><article className="metric-card"><CheckCircle2 size={20} /><span>Cerrados / asignados</span><strong>{assigned.length ? `${number(closed.length / assigned.length * 100)}%` : '—'}</strong><small>{closed.length} cerrados de {assigned.length} asignados</small></article><article className="metric-card"><Wrench size={20} /><span>Carga activa asignada</span><strong>{assigned.length - closed.length}</strong><small>Trabajos pendientes o en proceso</small></article><article className="metric-card"><Clock3 size={20} /><span>Resolución promedio</span><strong>{meanResolution == null ? '—' : `${number(meanResolution)} h`}</strong><small>{closedWithTime} cierres con registro y fecha válidos</small></article></div>
    {!!unknown.length && <p className="notice">{unknown.length} trabajo(s) tienen un responsable que no aparece en el equipo actual. Se incluyen en los totales y en el detalle exportado.</p>}
    <div className="module-grid"><section className="card chart-card"><div className="card-header"><div><h2>Trabajos por responsable</h2><p className="card-subtitle">Asignados = activos + cerrados.</p></div><Users size={19} /></div>{people.length ? <ResponsiveContainer width="100%" height={285}><BarChart data={people} margin={{ top: 10, right: 16, left: -20, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8ecf3" /><XAxis dataKey="shortName" tick={{ fontSize: 11 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} /><Legend /><Bar name="Activos" dataKey="active" stackId="jobs" fill="#5367ed" maxBarSize={40} /><Bar name="Cerrados" dataKey="closed" stackId="jobs" fill="#37a787" radius={[4, 4, 0, 0]} maxBarSize={40} /></BarChart></ResponsiveContainer> : <div className="empty-state">No hay integrantes del equipo en esta área.</div>}</section><section className="card chart-card"><div className="card-header"><div><h2>Distribución por tipo de avería</h2><p className="card-subtitle">Todos los trabajos dentro del rango seleccionado.</p></div><BarChart3 size={19} /></div>{chartTypes.length ? <><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={chartTypes} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84} paddingAngle={3}>{chartTypes.map((type, index) => <Cell key={type.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="chart-legend">{chartTypes.map((type, index) => <span key={type.name}><i style={{ background: COLORS[index % COLORS.length] }} />{type.name}: {type.value}</span>)}</div></> : <div className="empty-state">Sin trabajos registrados en este rango.</div>}</section></div>
    <section className="card chart-card" style={{ marginTop: 24 }}><div className="card-header"><div><h2>Carga de trabajo por área</h2><p className="card-subtitle">Incluye trabajos asignados y sin asignar.</p></div></div>{byArea.length ? <ResponsiveContainer width="100%" height={240}><BarChart data={byArea} layout="vertical" margin={{ top: 10, right: 22, left: 5, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8ecf3" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={116} tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Bar dataKey="Activos" stackId="area" fill="#5367ed" maxBarSize={27} /><Bar dataKey="Cerrados" stackId="area" fill="#37a787" radius={[0, 4, 4, 0]} maxBarSize={27} /></BarChart></ResponsiveContainer> : <div className="empty-state">No hay trabajo en las áreas seleccionadas.</div>}</section>
    <section className="card" style={{ marginTop: 24 }}><div className="card-header"><div><h2>Rendimiento por persona</h2><p className="card-subtitle">Las horas son tiempo transcurrido; no equivalen a horas de mano de obra.</p></div><span className="badge">{people.length} integrantes</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Responsable / área</th><th>Asignados</th><th>Activos</th><th>Cerrados</th><th>Tasa de cierre</th><th>Resolución media</th><th>Ejecución media</th><th>Avance medio</th></tr></thead><tbody>{people.map((member) => <tr key={member.id}><td><strong>{member.name}</strong><small style={{ display: 'block', marginTop: 4 }}>{member.area}</small></td><td>{member.assigned}</td><td>{member.active}</td><td>{member.closed}</td><td>{member.closureRate == null ? '—' : `${number(member.closureRate)}%`}</td><td>{member.averageResolution == null ? '—' : `${number(member.averageResolution)} h`}</td><td>{member.averageExecution == null ? '—' : `${number(member.averageExecution)} h`}</td><td>{member.progress == null ? '—' : `${number(member.progress)}%`}</td></tr>)}</tbody></table></div><div className="table-footer">Resolución: registro a cierre. Ejecución: inicio a cierre. — indica que no hay datos válidos para calcular el indicador.</div></section>
  </div>;
}
