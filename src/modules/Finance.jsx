import { useState } from 'react';
import { Plus, Download, Pencil, Trash2, Wallet, TrendingUp, Landmark, CircleDollarSign, AlertTriangle, Info } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart } from 'recharts';
import { Modal, Field, exportWorkbook, uid, todayISO, money, AREAS, BUILDINGS } from '../shared';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const STAGES = { requested: 'Solicitado', committed: 'Comprometido', paid: 'Pagado' };
const KINDS = { fixed: 'Cargo fijo', repair: 'Reparación', parts: 'Repuestos' };
const PLAN_STAGES = { planned: 'Proyectado', approved: 'Aprobado', executed: 'Ejecutado' };
const PRIORITIES = { high: 'Alta', medium: 'Media', low: 'Baja' };
const AREA_SHORT = { Infraestructura: 'Infraestr.', Electromecánica: 'Electrom.', Habitaciones: 'Habitac.', 'Servicios generales': 'S. grales.' };
const currentYear = () => Number(todayISO().slice(0, 4));
const currentMonth = () => Number(todayISO().slice(5, 7));
const monthPrefix = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
const defaultCutoff = (year, month) => {
  const prefix = monthPrefix(year, month);
  return todayISO().startsWith(prefix) ? todayISO() : `${prefix}-${daysInMonth(year, month)}`;
};
const sum = (items) => items.reduce((total, item) => total + Number(item.amount || 0), 0);
const purchaseManaged = (row) => Boolean(row?.procurementId || row?.source === 'purchasing');
const paymentDate = (row) => row.paidDate || row.date;

export function calculateMonthlyBudget(entries, budget, cutoff) {
  const monthRows = entries.filter((row) => row.date.startsWith(cutoff.slice(0, 7)));
  const paid = sum(monthRows.filter((row) => row.stage === 'paid' && paymentDate(row) <= cutoff));
  const reserved = sum(monthRows.filter((row) => row.stage === 'committed' || (row.stage === 'paid' && paymentDate(row) > cutoff)));
  const requested = sum(monthRows.filter((row) => row.stage === 'requested'));
  const obligations = paid + reserved;
  return { paid, reserved, requested, obligations, available: Number(budget) - obligations, fixed: sum(monthRows.filter((row) => row.kind === 'fixed' && row.stage !== 'requested')) };
}

export function seedFinance() {
  const year = currentYear();
  const month = currentMonth();
  const prefix = monthPrefix(year, month);
  return {
    currency: 'USD',
    monthlyBudgets: MONTHS.map((_, index) => ({ year, month: index + 1, amount: 12000 })),
    budgetEntries: [
      { id: 'MOV-001', date: `${prefix}-01`, requestId: '', purchaseOrder: 'CF-001', description: 'Contrato mensual de mantenimiento de ascensores', account: '6101', accountName: 'Contratos de mantenimiento', kind: 'fixed', stage: 'paid', amount: 2400 },
      { id: 'MOV-002', date: `${prefix}-05`, requestId: '', purchaseOrder: 'OC-1042', description: 'Repuestos para bombas de piscina', account: '6103', accountName: 'Repuestos electromecánicos', kind: 'parts', stage: 'paid', amount: 1850 },
      { id: 'MOV-003', date: `${prefix}-08`, requestId: '', purchaseOrder: 'OC-1045', description: 'Reparación de fuga en tubería de agua caliente', account: '6102', accountName: 'Reparaciones de infraestructura', kind: 'repair', stage: 'paid', amount: 950 },
      { id: 'MOV-004', date: `${prefix}-25`, requestId: '', purchaseOrder: 'CF-002', description: 'Servicio mensual de tratamiento de aguas', account: '6101', accountName: 'Contratos de mantenimiento', kind: 'fixed', stage: 'committed', amount: 1800 },
      { id: 'MOV-005', date: `${prefix}-20`, requestId: '', purchaseOrder: 'OC-1051', description: 'Compra aprobada de filtros para aire acondicionado', account: '6103', accountName: 'Repuestos electromecánicos', kind: 'parts', stage: 'committed', amount: 1200 },
      { id: 'MOV-006', date: `${prefix}-28`, requestId: '', purchaseOrder: '', description: 'Cotización de reparación de máquina de hielo', account: '6104', accountName: 'Servicios técnicos externos', kind: 'repair', stage: 'requested', amount: 1350 },
    ],
    capex: [
      { id: 'PROY-001', year: year + 1, type: 'CAPEX', title: 'Renovación de sistema de bombeo', description: 'Sustituir bombas con fallas recurrentes y mejorar eficiencia.', area: AREAS[1] || AREAS[0], building: BUILDINGS[0], priority: 'high', amount: 28000, stage: 'planned', finding: 'Fallas recurrentes observadas durante inspecciones preventivas.' },
      { id: 'PROY-002', year: year + 1, type: 'FF&E', title: 'Sustitución de mobiliario de habitaciones', description: 'Renovar mobiliario deteriorado de un primer grupo de habitaciones.', area: AREAS[2] || AREAS[0], building: BUILDINGS[1] || BUILDINGS[0], priority: 'medium', amount: 18500, stage: 'planned', finding: 'Desgaste identificado en las revisiones 360.' },
      { id: 'PROY-003', year: year + 1, type: 'CAPEX', title: 'Mejora de impermeabilización', description: 'Intervenir cubierta y puntos de filtración antes de la época lluviosa.', area: AREAS[0], building: BUILDINGS[2] || BUILDINGS[0], priority: 'high', amount: 14500, stage: 'approved', finding: 'Filtraciones de cubierta.' },
    ],
  };
}

function EntryEditor({ entry, orders, onClose, onSave }) {
  const [form, setForm] = useState(entry);
  const [error, setError] = useState('');
  const change = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    if (!form.description.trim() || !form.account.trim() || !form.accountName.trim() || !form.date || !(Number(form.amount) > 0)) {
      setError('Completa la fecha, descripción, cuenta contable y un importe mayor que cero.'); return;
    }
    if (form.stage !== 'requested' && form.kind !== 'fixed' && !form.purchaseOrder.trim()) {
      setError('Registra la orden de compra para una reparación o repuesto comprometido o pagado.'); return;
    }
    onSave({ ...form, amount: Number(form.amount), description: form.description.trim(), account: form.account.trim(), accountName: form.accountName.trim(), purchaseOrder: form.purchaseOrder.trim() });
  };
  return <Modal title={entry.id ? 'Editar movimiento' : 'Registrar movimiento'} onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="modal-body"><p className="notice">Un movimiento cambia de etapa: edítalo al recibir la orden o registrar el pago para evitar contabilizarlo dos veces.</p>
        <div className="form-grid">
          <Field label="Fecha del movimiento"><input type="date" required value={form.date} onChange={change('date')} /></Field>
          <Field label="Tipo de cargo"><select value={form.kind} onChange={change('kind')}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Solicitud relacionada (opcional)"><select value={form.requestId} onChange={change('requestId')}><option value="">Sin solicitud relacionada</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {order.title}</option>)}</select></Field>
          <Field label="Orden de compra / contrato"><input value={form.purchaseOrder} onChange={change('purchaseOrder')} placeholder="Ej. OC-1060 o contrato fijo" maxLength={80} /></Field>
          <Field label="Código de cuenta contable"><input value={form.account} onChange={change('account')} placeholder="Ej. 6103" required maxLength={40} /></Field>
          <Field label="Nombre de cuenta"><input value={form.accountName} onChange={change('accountName')} placeholder="Ej. Repuestos electromecánicos" required maxLength={140} /></Field>
          <Field label="Descripción"><input value={form.description} onChange={change('description')} required maxLength={300} /></Field>
          <Field label="Importe"><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={change('amount')} /></Field>
          <Field label="Etapa"><select value={form.stage} onChange={change('stage')}>{Object.entries(STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        </div>{error && <p role="alert" className="field-error">{error}</p>}
      </div><div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">Guardar movimiento</button></div>
    </form>
  </Modal>;
}

function CapexEditor({ project, orders, onClose, onSave }) {
  const [form, setForm] = useState(project);
  const [error, setError] = useState('');
  const change = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !(Number(form.amount) > 0) || Number(form.year) < 2000 || Number(form.year) > 2100) { setError('Registra un título, un año válido y un importe mayor que cero.'); return; }
    onSave({ ...form, title: form.title.trim(), amount: Number(form.amount), year: Number(form.year) });
  };
  return <Modal title={project.id ? 'Editar proyección' : 'Nueva mejora proyectada'} onClose={onClose} wide><form onSubmit={submit}><div className="modal-body"><div className="form-grid">
    <Field label="Mejora o proyecto"><input value={form.title} onChange={change('title')} maxLength={180} required /></Field>
    <Field label="Tipo"><select value={form.type} onChange={change('type')}><option>CAPEX</option><option>FF&E</option></select></Field>
    <Field label="Año de ejecución"><input type="number" min="2000" max="2100" required value={form.year} onChange={change('year')} /></Field>
    <Field label="Área"><select value={form.area} onChange={change('area')}>{AREAS.map((area) => <option key={area}>{area}</option>)}</select></Field>
    <Field label="Edificio"><select value={form.building} onChange={change('building')}>{BUILDINGS.map((building) => <option key={building}>{building}</option>)}</select></Field>
    <Field label="Prioridad"><select value={form.priority} onChange={change('priority')}>{Object.entries(PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label="Importe estimado"><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={change('amount')} /></Field>
    <Field label="Etapa"><select value={form.stage} onChange={change('stage')}>{Object.entries(PLAN_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label="Hallazgo / solicitud de origen (opcional)"><select value={form.orderId || ''} onChange={change('orderId')}><option value="">Sin solicitud vinculada</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {order.title}</option>)}</select></Field>
    <Field label="Hallazgo que justifica la mejora"><textarea value={form.finding || ''} onChange={change('finding')} rows={2} maxLength={2000} /></Field>
    <Field label="Descripción y alcance"><textarea value={form.description || ''} onChange={change('description')} rows={3} maxLength={3000} /></Field>
  </div>{error && <p role="alert" className="field-error">{error}</p>}</div><div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">Guardar proyección</button></div></form></Modal>;
}

function Metric({ title, value, note, icon: Icon = Wallet }) {
  return <div className="card metric-card"><div className="stat-top"><span>{title}</span><Icon size={19} /></div><strong className="stat-value">{value}</strong><p className="muted">{note}</p></div>;
}

export default function Finance({ data, setData, notify, mode = 'budget' }) {
  const [year, setYear] = useState(mode === 'capex' ? currentYear() + 1 : currentYear());
  const [yearInput, setYearInput] = useState(String(mode === 'capex' ? currentYear() + 1 : currentYear()));
  const [month, setMonth] = useState(currentMonth());
  const [cutoff, setCutoff] = useState(defaultCutoff(currentYear(), currentMonth()));
  const [editor, setEditor] = useState(null);
  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetValue, setBudgetValue] = useState('12000');
  const [removeItem, setRemoveItem] = useState(null);
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('all');
  const entries = data.budgetEntries || [];
  const projects = data.capex || [];
  const budgets = data.monthlyBudgets || [];
  const currency = data.currency || 'USD';
  const fmt = (value) => money(value, currency);
  const isCapex = mode === 'capex';
  const prefix = monthPrefix(year, month);
  const budget = Number(budgets.find((row) => Number(row.year) === Number(year) && Number(row.month) === Number(month))?.amount || 0);
  const monthEntries = entries.filter((row) => row.date.startsWith(prefix));
  const { paid, reserved, requested, obligations, available, fixed } = calculateMonthlyBudget(entries, budget, cutoff);
  const cutDay = Math.min(daysInMonth(year, month), Math.max(1, Number(cutoff.slice(-2))));
  const elapsedFraction = cutDay / daysInMonth(year, month);
  const consumptionFraction = budget > 0 ? paid / budget : 0;
  const warningTrend = budget > 0 && consumptionFraction > elapsedFraction * 1.2;
  const filteredEntries = monthEntries.filter((row) => `${row.id} ${row.requestId} ${row.purchaseOrder} ${row.description} ${row.account} ${row.accountName}`.toLowerCase().includes(search.toLowerCase()));
  const accountSummary = [...new Set(monthEntries.map((row) => row.account))].sort().map((account) => {
    const rows = monthEntries.filter((row) => row.account === account);
    return { account, name: rows[0]?.accountName || '', paid: sum(rows.filter((row) => row.stage === 'paid' && paymentDate(row) <= cutoff)), reserved: sum(rows.filter((row) => row.stage === 'committed' || (row.stage === 'paid' && paymentDate(row) > cutoff))), requested: sum(rows.filter((row) => row.stage === 'requested')) };
  });
  const selectedProjects = projects.filter((row) => Number(row.year) === Number(year));
  const filteredProjects = selectedProjects.filter((row) => (area === 'all' || row.area === area) && `${row.title} ${row.description} ${row.finding}`.toLowerCase().includes(search.toLowerCase()));
  const monthlyChart = MONTHS.map((label, index) => {
    const rows = entries.filter((row) => row.date.startsWith(monthPrefix(year, index + 1)));
    return { name: label.slice(0, 3), Pagado: sum(rows.filter((row) => row.stage === 'paid')), Comprometido: sum(rows.filter((row) => row.stage === 'committed')), Presupuesto: Number(budgets.find((row) => Number(row.year) === Number(year) && Number(row.month) === index + 1)?.amount || 0) };
  });
  const capexChart = AREAS.map((label) => ({ name: label, CAPEX: sum(selectedProjects.filter((row) => row.area === label && row.type === 'CAPEX')), 'FF&E': sum(selectedProjects.filter((row) => row.area === label && row.type === 'FF&E')) }));
  const changePeriod = (nextYear, nextMonth) => { setYear(Number(nextYear)); setYearInput(String(nextYear)); setMonth(Number(nextMonth)); setCutoff(defaultCutoff(Number(nextYear), Number(nextMonth))); };
  const applyYear = () => {
    const value = Number(yearInput);
    if (Number.isInteger(value) && value >= 2000 && value <= 2100) {
      if (value !== Number(year)) changePeriod(value, month);
      else setYearInput(String(year));
    }
    else { setYearInput(String(year)); notify('Selecciona un año entre 2000 y 2100.'); }
  };
  const saveEntry = (item) => {
    if (purchaseManaged(item) || purchaseManaged(entries.find((row) => row.id === item.id))) { notify('Actualiza esta línea desde Compras del departamento para mantener su trazabilidad.'); return; }
    setData((old) => ({ ...old, budgetEntries: item.id ? old.budgetEntries.map((row) => row.id === item.id ? item : row) : [...old.budgetEntries, { ...item, id: uid('MOV') }] }));
    setEditor(null); notify('Movimiento guardado sin duplicar etapas.');
  };
  const saveProject = (item) => {
    setData((old) => ({ ...old, capex: item.id ? old.capex.map((row) => row.id === item.id ? item : row) : [...old.capex, { ...item, id: uid('PROY') }] }));
    setEditor(null); notify('Proyección guardada.');
  };
  const saveBudget = (event) => {
    event.preventDefault();
    const amount = Number(budgetValue);
    if (!Number.isFinite(amount) || amount < 0) return;
    setData((old) => ({ ...old, monthlyBudgets: [...old.monthlyBudgets.filter((row) => !(Number(row.year) === Number(year) && Number(row.month) === Number(month))), { year: Number(year), month: Number(month), amount }] }));
    setBudgetModal(false); notify('Presupuesto mensual actualizado.');
  };
  const remove = () => {
    if (!isCapex && purchaseManaged(removeItem)) { notify('Una compra vinculada se cancela desde Compras; no se elimina en Presupuesto.'); setRemoveItem(null); return; }
    const key = isCapex ? 'capex' : 'budgetEntries';
    setData((old) => ({ ...old, [key]: old[key].filter((row) => row.id !== removeItem.id) }));
    setRemoveItem(null); notify(isCapex ? 'Proyección eliminada.' : 'Movimiento eliminado.');
  };
  const doExport = async () => {
    try {
      await exportWorkbook(`control-finanzas-${year}`, [
        { name: 'Movimientos', rows: entries.map((row) => ({ ID: row.id, Fecha: row.date, 'Fecha de pago': row.paidDate || '', Compra: row.procurementId || '', Solicitud: row.requestId, 'Orden de compra': row.purchaseOrder, Cuenta: row.account, 'Nombre de cuenta': row.accountName, Descripción: row.description, Tipo: KINDS[row.kind], Etapa: STAGES[row.stage], Importe: row.amount, Moneda: currency })) },
        { name: 'Presupuesto mensual', rows: monthlyChart.map((row, index) => ({ Año: year, Mes: MONTHS[index], Presupuesto: row.Presupuesto, Pagado: row.Pagado, Comprometido: row.Comprometido, Disponible: row.Presupuesto - row.Pagado - row.Comprometido, Solicitado: sum(entries.filter((entry) => entry.date.startsWith(monthPrefix(year, index + 1)) && entry.stage === 'requested')), Moneda: currency })) },
        { name: 'CAPEX y FFE', rows: projects.map((row) => ({ ID: row.id, Año: row.year, Tipo: row.type, Mejora: row.title, Área: row.area, Edificio: row.building, Prioridad: PRIORITIES[row.priority], Etapa: PLAN_STAGES[row.stage], 'Importe estimado': row.amount, Hallazgo: row.finding, Solicitud: row.orderId || '', Descripción: row.description, Moneda: currency })) },
        { name: 'Corte seleccionado', rows: [{ Año: year, Mes: MONTHS[month - 1], Corte: cutoff, Presupuesto: budget, 'Pagado al corte': paid, 'Comprometido y posterior al corte': reserved, 'Solicitado sin compromiso': requested, 'Cargos fijos incluidos': fixed, Disponible: available, 'Proyección con solicitudes': obligations + requested, Moneda: currency }] },
        { name: 'Por cuenta al corte', rows: accountSummary.map((row) => ({ Año: year, Mes: MONTHS[month - 1], Corte: cutoff, Cuenta: row.account, Nombre: row.name, Pagado: row.paid, 'Por cubrir': row.reserved, Solicitado: row.requested, 'Proyección total': row.paid + row.reserved + row.requested, Moneda: currency })) },
      ]);
      notify('Excel financiero exportado.');
    } catch { notify('No fue posible exportar. Vuelve a intentarlo.'); }
  };
  const addNew = () => setEditor(isCapex ? { title: '', year: Number(year), type: 'CAPEX', area: AREAS[0], building: BUILDINGS[0], priority: 'medium', amount: '', stage: 'planned', finding: '', description: '', orderId: '' } : { date: cutoff, requestId: '', purchaseOrder: '', description: '', account: '', accountName: '', kind: 'repair', stage: 'requested', amount: '' });

  return <div>
    <div className="module-heading"><div><h2>{isCapex ? 'Proyecta las mejoras del próximo año' : 'Cada movimiento, en su cuenta'}</h2><p className="muted">{isCapex ? 'Planifica inversiones CAPEX y mobiliario, accesorios y equipos (FF&E) por área.' : 'Presupuesto operativo por mes, solicitudes, órdenes de compra y cargos fijos.'}</p></div><div className="inline-actions"><button className="button secondary" onClick={doExport}><Download size={16} />Excel</button><button className="button primary" onClick={addNew}><Plus size={17} />{isCapex ? 'Nueva proyección' : 'Nuevo movimiento'}</button></div></div>
    <div className="card toolbar"><Field label="Año"><input aria-label="Año financiero" type="number" min="2000" max="2100" value={yearInput} onChange={(event) => setYearInput(event.target.value)} onBlur={applyYear} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></Field>{!isCapex && <><Field label="Mes"><select aria-label="Mes presupuestario" value={month} onChange={(event) => changePeriod(year, event.target.value)}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></Field><Field label="Fecha de corte"><input aria-label="Fecha de corte" type="date" min={`${prefix}-01`} max={`${prefix}-${daysInMonth(year, month)}`} value={cutoff} onChange={(event) => { if (event.target.value.startsWith(prefix)) setCutoff(event.target.value); }} /></Field><button className="button secondary" onClick={() => { setBudgetValue(String(budget)); setBudgetModal(true); }}><Pencil size={15} />Presupuesto del mes</button></>}{isCapex && <Field label="Área"><select value={area} onChange={(event) => setArea(event.target.value)}><option value="all">Todas las áreas</option>{AREAS.map((label) => <option key={label}>{label}</option>)}</select></Field>}</div>
    {isCapex ? <>
      <div className="metric-grid"><Metric title="Proyección total" value={fmt(sum(selectedProjects))} note={`${selectedProjects.length} mejoras para ${year}`} icon={TrendingUp} /><Metric title="CAPEX" value={fmt(sum(selectedProjects.filter((row) => row.type === 'CAPEX')))} note="Inversiones de capital" icon={Landmark} /><Metric title="FF&E" value={fmt(sum(selectedProjects.filter((row) => row.type === 'FF&E')))} note="Mobiliario, accesorios y equipos" /><Metric title="Aprobado" value={fmt(sum(selectedProjects.filter((row) => row.stage === 'approved')))} note="Importes estimados aprobados" icon={CircleDollarSign} /></div>
      <section className="card chart-card"><h3>Inversión proyectada por área · {year}</h3><ResponsiveContainer width="100%" height={280}><BarChart data={capexChart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} tickFormatter={(value) => AREA_SHORT[value] || value} /><YAxis width={45} tickFormatter={(value) => `${value / 1000}k`} /><Tooltip formatter={(value) => fmt(value)} /><Legend /><Bar dataKey="CAPEX" stackId="total" fill="#5367ed" radius={[0, 0, 0, 0]} /><Bar dataKey="FF&E" stackId="total" fill="#9c8ce9" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></section>
    </> : <>
      <div className="metric-grid"><Metric title="Presupuesto mensual" value={fmt(budget)} note={`${MONTHS[month - 1]} ${year}`} /><Metric title="Pagado al corte" value={fmt(paid)} note={`Hasta el ${cutoff}`} icon={CircleDollarSign} /><Metric title="Por cubrir en el mes" value={fmt(reserved)} note="Compromisos y pagos posteriores al corte" icon={Landmark} /><Metric title="Disponible" value={fmt(available)} note="Presupuesto − pagado − por cubrir" icon={TrendingUp} /></div>
      {available < 0 && <div className="alert-box"><AlertTriangle size={20} /><p><strong>Presupuesto excedido en {fmt(-available)}.</strong> Los pagos y compromisos del mes superan el límite autorizado.</p></div>}
      {available >= 0 && warningTrend && <div className="alert-box"><AlertTriangle size={20} /><p><strong>Ritmo de consumo elevado.</strong> Se ha pagado el {(consumptionFraction * 100).toFixed(1)}% del presupuesto al {(elapsedFraction * 100).toFixed(1)}% del mes. Revisa próximos pagos y compromisos.</p></div>}
      {!budget && <div className="notice">No hay presupuesto registrado para este mes. Define el límite para comparar la ejecución.</div>}
      <div className="card summary-row"><span>Cargos fijos incluidos: <strong>{fmt(fixed)}</strong></span><span>Solicitado sin compromiso: <strong>{fmt(requested)}</strong></span><span>Proyección total: <strong>{fmt(obligations + requested)}</strong></span></div>
      <div className="notice"><Info size={17} /><span>Los cargos fijos comprometidos se incluyen aunque venzan después del corte. «Solicitado» es una estimación y no reduce el disponible; cambia la misma fila a «Comprometido» o «Pagado» al avanzar. Los pagos posteriores al corte quedan en «Por cubrir».</span></div>
      <section className="card chart-card"><h3>Ejecución y presupuesto · {year}</h3><ResponsiveContainer width="100%" height={280}><ComposedChart data={monthlyChart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(value) => `${value / 1000}k`} /><Tooltip formatter={(value) => fmt(value)} /><Legend /><Bar dataKey="Pagado" stackId="amount" fill="#5367ed" /><Bar dataKey="Comprometido" stackId="amount" fill="#a0b2f5" radius={[4, 4, 0, 0]} /><Line type="monotone" dataKey="Presupuesto" stroke="#e6a54e" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer><p className="muted">El gráfico muestra el mes completo; las tarjetas superiores respetan la fecha de corte.</p></section>
    </>}
    <section className="card"><div className="card-header"><div><h3 className="card-title">{isCapex ? `Plan de inversión ${year}` : `Registro de movimientos · ${MONTHS[month - 1]}`}</h3><p className="card-subtitle">{isCapex ? 'Cada mejora conserva su hallazgo y su área de ejecución.' : `${filteredEntries.length} movimientos · importes en ${currency}`}</p></div><input className="finance-search" aria-label={isCapex ? 'Buscar proyecciones' : 'Buscar movimientos'} placeholder="Buscar descripción, cuenta u orden…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="table-wrap"><table className="data-table"><thead>{isCapex ? <tr><th>Mejora / origen</th><th>Área / edificio</th><th>Tipo</th><th>Prioridad</th><th>Etapa</th><th>Estimado</th><th>Acciones</th></tr> : <tr><th>Fecha / solicitud</th><th>Descripción / orden</th><th>Cuenta</th><th>Tipo</th><th>Etapa</th><th>Importe</th><th>Acciones</th></tr>}</thead><tbody>{isCapex ? filteredProjects.map((row) => <tr key={row.id}><td><strong>{row.title}</strong><div className="muted">{row.finding || 'Sin hallazgo registrado'}</div>{row.orderId && <div className="muted">Solicitud {row.orderId}</div>}</td><td>{row.area}<div className="muted">{row.building}</div></td><td><span className="badge">{row.type}</span></td><td><span className={`badge ${row.priority}`}>{PRIORITIES[row.priority]}</span></td><td>{PLAN_STAGES[row.stage]}</td><td>{fmt(row.amount)}</td><td><div className="inline-actions"><button className="icon-button" aria-label={`Editar ${row.title}`} onClick={() => setEditor(row)}><Pencil size={16} /></button><button className="icon-button" aria-label={`Eliminar ${row.title}`} onClick={() => setRemoveItem(row)}><Trash2 size={16} /></button></div></td></tr>) : filteredEntries.map((row) => <tr key={row.id}><td>{row.date}<div className="muted">{row.requestId || 'Sin solicitud'}</div></td><td><strong>{row.description}</strong><div className="muted">{row.purchaseOrder || 'Orden pendiente'} · {row.id}</div>{row.procurementId && <div className="muted">Compra: {row.procurementId}</div>}{row.paidDate && <div className="muted">Pago: {row.paidDate}</div>}</td><td>{row.account}<div className="muted">{row.accountName}</div></td><td>{KINDS[row.kind]}</td><td><span className={`badge ${row.stage === 'paid' ? 'success' : row.stage === 'committed' ? 'medium' : ''}`}>{STAGES[row.stage]}</span></td><td>{fmt(row.amount)}</td><td>{purchaseManaged(row) ? <span className="muted" title={`Compra vinculada ${row.procurementId}`}>Gestionado desde Compras</span> : <div className="inline-actions"><button className="icon-button" aria-label={`Editar ${row.description}`} onClick={() => setEditor(row)}><Pencil size={16} /></button><button className="icon-button" aria-label={`Eliminar ${row.description}`} onClick={() => setRemoveItem(row)}><Trash2 size={16} /></button></div>}</td></tr>)}</tbody></table></div>{!(isCapex ? filteredProjects.length : filteredEntries.length) && <div className="empty-state"><Wallet size={28} /><h3>No hay registros para esta selección</h3><p>Agrega un movimiento o ajusta el período y la búsqueda.</p></div>}</section>
    {!isCapex && <section className="card"><div className="card-header"><div><h3 className="card-title">Distribución por cuenta contable</h3><p className="card-subtitle">Todos los movimientos del mes, con el mismo corte de las tarjetas.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Cuenta</th><th>Nombre</th><th>Pagado al corte</th><th>Por cubrir</th><th>Solicitado</th><th>Proyección total</th></tr></thead><tbody>{accountSummary.map((row) => <tr key={row.account}><td><strong>{row.account}</strong></td><td>{row.name}</td><td>{fmt(row.paid)}</td><td>{fmt(row.reserved)}</td><td>{fmt(row.requested)}</td><td>{fmt(row.paid + row.reserved + row.requested)}</td></tr>)}</tbody></table></div>{!accountSummary.length && <div className="empty-state">Sin cuentas con movimientos en este período.</div>}</section>}
    <p className="notice">Registro operativo del departamento: los importes se expresan en {currency}. Las proyecciones de inversión se controlan por separado y no se cargan automáticamente al gasto operativo. Este módulo no genera asientos de partida doble ni conciliación bancaria.</p>
    {editor && (isCapex ? <CapexEditor project={editor} orders={data.orders || []} onSave={saveProject} onClose={() => setEditor(null)} /> : <EntryEditor entry={editor} orders={data.orders || []} onSave={saveEntry} onClose={() => setEditor(null)} />)}
    {budgetModal && <Modal title={`Presupuesto · ${MONTHS[month - 1]} ${year}`} onClose={() => setBudgetModal(false)}><form onSubmit={saveBudget}><div className="modal-body"><Field label={`Presupuesto autorizado (${currency})`}><input type="number" min="0" step="0.01" required value={budgetValue} onChange={(event) => setBudgetValue(event.target.value)} /></Field><p className="muted">Este valor afecta únicamente al mes seleccionado.</p></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setBudgetModal(false)}>Cancelar</button><button className="button primary" type="submit">Guardar presupuesto</button></div></form></Modal>}
    {removeItem && <Modal title="¿Eliminar este registro?" onClose={() => setRemoveItem(null)}><div className="modal-body"><p>Se eliminará «{removeItem.title || removeItem.description}». Esta acción no se puede deshacer.</p></div><div className="modal-footer"><button className="button secondary" onClick={() => setRemoveItem(null)}>Cancelar</button><button className="button danger" onClick={remove}>Eliminar registro</button></div></Modal>}
  </div>;
}
