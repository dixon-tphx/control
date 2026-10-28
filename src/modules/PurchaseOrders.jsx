import { useState } from 'react';
import { Plus, Download, Pencil, Eye, Trash2, Ban, ShoppingCart, Wallet, CheckCircle2, FileClock, Info } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Modal, Field, uid, todayISO, formatDate, money, exportWorkbook } from '../shared';

const STAGES = { requested: 'Solicitud', approved: 'Aprobada', ordered: 'Orden emitida', received: 'Recibida', paid: 'Pagada', cancelled: 'Cancelada' };
const KINDS = { fixed: 'Mantenimiento fijo / contrato', repair: 'Reparación', parts: 'Repuestos' };
const TRANSITIONS = {
  requested: ['requested', 'approved', 'cancelled'],
  approved: ['approved', 'ordered', 'cancelled'],
  ordered: ['ordered', 'received', 'paid', 'cancelled'],
  received: ['received', 'paid', 'cancelled'],
  paid: ['paid'],
  cancelled: ['cancelled'],
};
const sum = (rows) => rows.reduce((total, row) => total + Number(row.amount || 0), 0);
const normal = (value) => String(value || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const periodOf = (row) => (row.expectedDate || row.date || '').slice(0, 7);
const committed = (row) => ['approved', 'ordered', 'received'].includes(row.stage);

export function seedPurchaseOrders() { return { purchaseOrders: [] }; }

export function validatePurchaseOrder(record, previous = null) {
  if (!record.description?.trim() || !record.account?.trim() || !record.accountName?.trim()) return 'La descripción y la cuenta contable completa son obligatorias.';
  if (!Number.isFinite(Number(record.amount)) || Number(record.amount) <= 0) return 'El importe debe ser mayor que cero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(record.expectedDate || '')) return 'Registra la fecha de solicitud y la fecha prevista de cargo presupuestario.';
  if (!STAGES[record.stage] || !KINDS[record.kind]) return 'Selecciona una etapa y un tipo de compra válidos.';
  if (previous && !TRANSITIONS[previous.stage]?.includes(record.stage)) return 'La etapa no puede retroceder. Conserva el historial y cancela una compra no pagada si corresponde.';
  if (['ordered', 'received', 'paid'].includes(record.stage) && record.kind !== 'fixed' && !record.purchaseOrder?.trim()) return 'Una orden emitida, recibida o pagada requiere un número de orden de compra.';
  if (['approved', 'ordered', 'received', 'paid'].includes(record.stage) && !record.supplier?.trim()) return 'Indica el proveedor o contratista antes de aprobar la compra.';
  if (record.stage === 'paid' && !/^\d{4}-\d{2}-\d{2}$/.test(record.paidDate || '')) return 'Registra la fecha de pago.';
  if (record.stage === 'paid' && record.paidDate > todayISO()) return 'La fecha de pago no puede ser futura. Mantén la compra comprometida hasta registrar el pago.';
  if (record.stage === 'paid' && record.paidDate < record.date) return 'La fecha de pago no puede ser anterior a la solicitud.';
  if (record.stage === 'cancelled' && !record.cancelReason?.trim()) return 'Describe el motivo de cancelación para conservar la trazabilidad.';
  if (previous?.stage === 'paid' || previous?.stage === 'cancelled') return 'Este registro está cerrado y se conserva sin cambios. Un pago requiere un ajuste contable independiente.';
  return '';
}

// A purchase owns exactly one budget line throughout its lifecycle. Existing manual
// budget lines remain untouched; cancelled unpaid purchases retain only their history.
export function reconcilePurchaseOrder(data, record) {
  const purchases = data.purchaseOrders || [];
  const previous = purchases.find((row) => row.id === record.id);
  const error = validatePurchaseOrder(record, previous);
  if (error) throw new Error(error);
  const budgetId = previous?.budgetEntryId || record.budgetEntryId;
  if (!record.id || !budgetId) throw new Error('Falta el identificador de compra o de presupuesto.');
  const timestamp = record.updatedAt || new Date().toISOString();
  const saved = { ...record, budgetEntryId: budgetId, amount: Number(record.amount), history: [...(previous?.history || []), { at: timestamp, from: previous?.stage || null, to: record.stage, note: record.stage === 'cancelled' ? record.cancelReason : previous?.stage === record.stage ? 'Datos de compra actualizados' : 'Cambio de etapa registrado' }] };
  const remaining = (data.budgetEntries || []).filter((row) => row.procurementId !== record.id && row.id !== budgetId);
  const budgetStage = record.stage === 'requested' ? 'requested' : record.stage === 'paid' ? 'paid' : 'committed';
  const entry = { id: budgetId, procurementId: record.id, source: 'purchasing', date: record.expectedDate || record.date, requestId: record.requestId || '', purchaseOrder: record.purchaseOrder || '', description: record.description, account: record.account, accountName: record.accountName, kind: record.kind, stage: budgetStage, amount: Number(record.amount), supplier: record.supplier || '', paidDate: record.stage === 'paid' ? record.paidDate : '', procurementStage: record.stage };
  return { ...data, purchaseOrders: previous ? purchases.map((row) => row.id === record.id ? saved : row) : [...purchases, saved], budgetEntries: record.stage === 'cancelled' ? remaining : [...remaining, entry] };
}

function PurchaseEditor({ record, orders, onSave, onClose }) {
  const [form, setForm] = useState(record);
  const [error, setError] = useState('');
  const locked = ['paid', 'cancelled'].includes(record.stage);
  const change = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const options = record.id ? TRANSITIONS[record.stage].filter((stage) => stage !== 'cancelled') : ['requested', 'approved', 'ordered', 'received', 'paid'];
  const submit = (event) => {
    event.preventDefault();
    const prepared = { ...form, amount: Number(form.amount), description: form.description.trim(), account: form.account.trim(), accountName: form.accountName.trim(), supplier: form.supplier.trim(), purchaseOrder: form.purchaseOrder.trim() };
    const message = validatePurchaseOrder(prepared, record.id ? record : null);
    if (message) { setError(message); return; }
    onSave(prepared);
  };
  return <Modal title={record.id ? `${locked ? 'Consultar' : 'Actualizar'} compra · ${record.id}` : 'Nueva solicitud de compra'} onClose={onClose} wide>
    <form onSubmit={submit}>
      {locked && <p className="notice"><Info size={17} />{record.stage === 'paid' ? 'Compra pagada: no se modifica ni cancela. Una corrección exige un ajuste contable independiente.' : `Compra cancelada: ${record.cancelReason}`}</p>}
      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}><div className="form-grid">
        <Field label="Solicitud de trabajo relacionada"><select value={form.requestId} onChange={change('requestId')}><option value="">Sin solicitud / cargo fijo</option>{orders.map((order) => <option value={order.id} key={order.id}>{order.id} · {order.title}</option>)}</select></Field>
        <Field label="Tipo de compra"><select value={form.kind} onChange={change('kind')}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Descripción de la compra"><textarea value={form.description} onChange={change('description')} required maxLength={2000} rows={3} placeholder="Repuesto, reparación o alcance del contrato" /></Field>
        <Field label="Proveedor / contratista"><input value={form.supplier} onChange={change('supplier')} maxLength={160} placeholder="Obligatorio para aprobar" /></Field>
        <Field label="Cuenta contable"><input value={form.account} onChange={change('account')} required maxLength={40} placeholder="Ej. 6103" /></Field>
        <Field label="Nombre de la cuenta"><input value={form.accountName} onChange={change('accountName')} required maxLength={160} placeholder="Ej. Repuestos electromecánicos" /></Field>
        <Field label="Importe total"><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={change('amount')} /></Field>
        <Field label="Etapa de compra"><select value={form.stage} onChange={change('stage')}>{options.map((value) => <option key={value} value={value}>{STAGES[value]}</option>)}</select></Field>
        <Field label="Fecha de solicitud"><input type="date" required value={form.date} onChange={change('date')} /></Field>
        <Field label="Fecha prevista de cargo presupuestario"><input type="date" required value={form.expectedDate} onChange={change('expectedDate')} /></Field>
        <Field label="Número de orden / contrato"><input value={form.purchaseOrder} onChange={change('purchaseOrder')} maxLength={100} placeholder="OC o contrato fijo" /></Field>
        {form.stage === 'paid' && <Field label="Fecha de pago"><input type="date" required max={todayISO()} value={form.paidDate} onChange={change('paidDate')} /></Field>}
        <Field label="Observaciones"><textarea value={form.notes || ''} onChange={change('notes')} rows={2} maxLength={3000} /></Field>
      </div></fieldset>
      {!locked && <p className="notice">La aprobación reserva presupuesto. Emitir o recibir la orden actualiza la misma línea; pagar cambia esa línea a pagada, sin duplicar el gasto. Los cargos fijos se incluyen en el mes previsto aunque venzan después del corte.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {record.history?.length > 0 && <div><h3>Historial de etapas</h3><ol className="purchase-history">{record.history.map((item, index) => <li key={`${item.at}-${index}`}><strong>{item.from ? `${STAGES[item.from]} → ` : ''}{STAGES[item.to]}</strong> · {formatDate(item.at)}<div className="muted">{item.note}</div></li>)}</ol></div>}
      <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>{locked ? 'Cerrar' : 'Cancelar'}</button>{!locked && <button type="submit" className="button primary">Guardar compra</button>}</div>
    </form>
  </Modal>;
}

export default function PurchaseOrders({ data, setData, notify }) {
  const [period, setPeriod] = useState(todayISO().slice(0, 7));
  const [stage, setStage] = useState('all');
  const [account, setAccount] = useState('all');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [action, setAction] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [exporting, setExporting] = useState(false);
  const purchases = data.purchaseOrders || [];
  const currency = data.currency || 'USD';
  const fmt = (amount) => money(amount, currency);
  const monthRows = purchases.filter((row) => !period || periodOf(row) === period);
  const visible = monthRows.filter((row) => (stage === 'all' || row.stage === stage) && (account === 'all' || row.account === account) && normal(`${row.id} ${row.requestId} ${row.description} ${row.supplier} ${row.purchaseOrder} ${row.account} ${row.accountName}`).includes(normal(search)));
  const accounts = [...new Set(purchases.map((row) => row.account))].sort();
  const live = monthRows.filter((row) => row.stage !== 'cancelled');
  const requested = sum(live.filter((row) => row.stage === 'requested'));
  const reserve = sum(live.filter(committed));
  const paid = sum(live.filter((row) => row.stage === 'paid'));
  const fixed = sum(live.filter((row) => row.kind === 'fixed' && row.stage !== 'requested'));
  const accountChart = [...new Set(live.map((row) => row.account))].sort().map((code) => ({ name: code, Solicitado: sum(live.filter((row) => row.account === code && row.stage === 'requested')), Comprometido: sum(live.filter((row) => row.account === code && committed(row))), Pagado: sum(live.filter((row) => row.account === code && row.stage === 'paid')) }));
  const stageChart = Object.entries(STAGES).filter(([id]) => id !== 'cancelled').map(([id, label]) => ({ name: label, Importe: sum(live.filter((row) => row.stage === id)) }));
  const save = (record) => {
    const previous = purchases.find((row) => row.id === record.id);
    const message = validatePurchaseOrder(record, previous);
    if (message) { notify(message); return false; }
    const next = { ...record, id: previous?.id || uid('COMPRA'), budgetEntryId: previous?.budgetEntryId || uid('MOV'), createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    setData((old) => reconcilePurchaseOrder(old, next));
    setEditor(null); notify('Compra y presupuesto actualizados en una sola línea.'); return true;
  };
  const openNew = () => setEditor({ requestId: '', description: '', account: '', accountName: '', kind: 'parts', stage: 'requested', supplier: '', amount: '', date: todayISO(), expectedDate: period ? `${period}-${todayISO().startsWith(period) ? todayISO().slice(-2) : '01'}` : todayISO(), purchaseOrder: '', paidDate: '', notes: '' });
  const runAction = () => {
    if (!action) return;
    if (action.type === 'delete') {
      if (action.record.stage !== 'requested') { setActionError('Solo se puede eliminar una solicitud sin aprobar.'); return; }
      setData((old) => ({ ...old, purchaseOrders: (old.purchaseOrders || []).filter((row) => row.id !== action.record.id), budgetEntries: (old.budgetEntries || []).filter((row) => row.procurementId !== action.record.id && row.id !== action.record.budgetEntryId) }));
      notify('Borrador y estimación presupuestaria eliminados.');
    } else {
      if (!cancelReason.trim()) { setActionError('Escribe el motivo de cancelación.'); return; }
      if (!save({ ...action.record, stage: 'cancelled', cancelReason: cancelReason.trim() })) return;
    }
    setAction(null); setCancelReason(''); setActionError('');
  };
  const exportExcel = async () => {
    setExporting(true);
    try {
      await exportWorkbook(`control-compras-${period || 'historico'}`, [
        { name: 'Compras seleccionadas', rows: visible.map((row) => ({ Compra: row.id, Solicitud: row.requestId, Descripción: row.description, Cuenta: row.account, 'Nombre cuenta': row.accountName, Tipo: KINDS[row.kind], Etapa: STAGES[row.stage], Proveedor: row.supplier, Importe: row.amount, Moneda: currency, 'Fecha solicitud': row.date, 'Cargo presupuestario': row.expectedDate, 'Orden o contrato': row.purchaseOrder, 'Fecha pago': row.paidDate || '', 'Línea presupuesto': row.budgetEntryId, 'Motivo cancelación': row.cancelReason || '', Observaciones: row.notes || '' })) },
        { name: 'Resumen del período', rows: [{ Período: period || 'Todo el historial', Solicitado: requested, Comprometido: reserve, Pagado: paid, 'Obligaciones sin duplicar': reserve + paid, 'Mantenimiento fijo incluido': fixed, Moneda: currency }] },
        { name: 'Por cuenta', rows: accountChart.map((row) => ({ Cuenta: row.name, Solicitado: row.Solicitado, Comprometido: row.Comprometido, Pagado: row.Pagado, Moneda: currency })) },
        { name: 'Historial de etapas', rows: visible.flatMap((row) => (row.history || []).map((event) => ({ Compra: row.id, Fecha: event.at, Desde: STAGES[event.from] || 'Alta', Hasta: STAGES[event.to], Nota: event.note }))) },
      ]);
      notify('Compras exportadas a Excel.');
    } catch { notify('No se pudo exportar. Vuelve a intentarlo.'); }
    finally { setExporting(false); }
  };
  const chooseAction = (record, type) => { setAction({ record, type }); setCancelReason(''); setActionError(''); };
  return <div>
    <div className="module-heading"><div><h2>Compras del departamento</h2><p className="muted">De la solicitud a la orden de compra: cuenta, proveedor, contrato y presupuesto conectados.</p></div><div className="inline-actions"><button className="button secondary" onClick={exportExcel} disabled={exporting}><Download size={16} />{exporting ? 'Exportando…' : 'Excel de compras'}</button><button className="button primary" onClick={openNew}><Plus size={17} />Nueva compra</button></div></div>
    <div className="notice"><Info size={17} /><span>Este módulo registra únicamente las compras nuevas. Los movimientos anteriores del presupuesto se conservan como registros manuales, sin convertirlos ni duplicarlos. Las etapas son de control operativo; no se envían órdenes ni pagos reales.</span></div>
    <div className="card toolbar"><Field label="Mes de cargo presupuestario"><input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></Field><Field label="Etapa"><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">Todas las etapas</option>{Object.entries(STAGES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="Cuenta"><select value={account} onChange={(event) => setAccount(event.target.value)}><option value="all">Todas las cuentas</option>{accounts.map((code) => <option key={code}>{code}</option>)}</select></Field><Field label="Buscar compra"><input placeholder="Descripción, orden o proveedor…" value={search} onChange={(event) => setSearch(event.target.value)} /></Field><button className="button ghost small" onClick={() => { setPeriod(''); setStage('all'); setAccount('all'); setSearch(''); }}>Ver todo el historial</button></div>
    <div className="metric-grid">{[
      ['Solicitudes sin compromiso', requested, 'Estimaciones pendientes de aprobación', FileClock],
      ['Comprometido', reserve, 'Aprobadas, emitidas y recibidas', ShoppingCart],
      ['Pagado', paid, 'Compras cerradas con fecha de pago', CheckCircle2],
      ['Mantenimiento fijo incluido', fixed, 'Parte del compromiso y pago; no se suma otra vez', Wallet],
    ].map(([label, value, note, Icon]) => <div className="card metric-card" key={label}><div className="stat-top"><span>{label}</span><Icon size={19} /></div><strong className="stat-value">{fmt(value)}</strong><p className="muted">{note}</p></div>)}</div>
    {live.length > 0 && <div className="module-grid"><section className="card chart-card"><h3>Importe por cuenta · {period || 'histórico'}</h3><ResponsiveContainer width="100%" height={260}><BarChart data={accountChart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis width={50} tickFormatter={(value) => value >= 1000 ? `${value / 1000}k` : value} /><Tooltip formatter={(value) => fmt(value)} /><Legend /><Bar dataKey="Solicitado" fill="#bac4ee" /><Bar dataKey="Comprometido" fill="#5367ed" /><Bar dataKey="Pagado" fill="#71bfa1" /></BarChart></ResponsiveContainer></section><section className="card chart-card"><h3>Distribución por etapa</h3><ResponsiveContainer width="100%" height={260}><BarChart data={stageChart} layout="vertical" margin={{ left: 12, right: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => value >= 1000 ? `${value / 1000}k` : value} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => fmt(value)} /><Bar dataKey="Importe" fill="#5367ed" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></section></div>}
    <section className="card"><div className="card-header"><div><h3 className="card-title">Solicitudes, órdenes y contratos</h3><p className="card-subtitle">{visible.length} registros visibles · obligaciones del período {fmt(reserve + paid)} · sin sumar estimaciones</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Compra / solicitud</th><th>Proveedor / orden</th><th>Cuenta</th><th>Etapa</th><th>Cargo previsto</th><th>Importe</th><th>Acciones</th></tr></thead><tbody>{[...visible].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map((row) => <tr key={row.id}><td><strong>{row.description}</strong><div className="muted">{row.id} · {row.requestId || 'Sin solicitud'}</div><div className="muted">{KINDS[row.kind]}</div></td><td>{row.supplier || 'Por definir'}<div className="muted">{row.purchaseOrder || 'Orden pendiente'}</div></td><td>{row.account}<div className="muted">{row.accountName}</div></td><td><span className={`badge ${row.stage === 'paid' ? 'success' : row.stage === 'cancelled' ? 'danger' : committed(row) ? 'medium' : ''}`}>{STAGES[row.stage]}</span>{row.paidDate && <div className="muted">Pago: {formatDate(row.paidDate)}</div>}</td><td>{formatDate(row.expectedDate || row.date)}</td><td>{fmt(row.amount)}</td><td><div className="inline-actions"><button className="icon-button" aria-label={`${['paid', 'cancelled'].includes(row.stage) ? 'Ver' : 'Editar'} compra ${row.id}`} onClick={() => setEditor(row)}>{['paid', 'cancelled'].includes(row.stage) ? <Eye size={16} /> : <Pencil size={16} />}</button>{row.stage === 'requested' && <button className="icon-button" aria-label={`Eliminar borrador ${row.id}`} onClick={() => chooseAction(row, 'delete')}><Trash2 size={16} /></button>}{!['paid', 'cancelled'].includes(row.stage) && <button className="icon-button" aria-label={`Cancelar compra ${row.id}`} onClick={() => chooseAction(row, 'cancel')}><Ban size={16} /></button>}</div></td></tr>)}</tbody></table></div>{!visible.length && <div className="empty-state"><ShoppingCart size={30} /><h3>{purchases.length ? 'Sin compras para estos filtros' : 'La primera compra empieza aquí'}</h3><p>{purchases.length ? 'Ajusta el período, la etapa o la cuenta.' : 'Registra una solicitud, asígnale su cuenta y dale seguimiento hasta el pago.'}</p><button className="button secondary" onClick={openNew}>Registrar compra</button></div>}</section>
    <p className="notice">Cada compra conserva su historial. Solo se eliminan borradores; las aprobadas se cancelan con motivo y las pagadas quedan bloqueadas. Los movimientos vinculados se actualizan desde Compras, no desde Presupuesto. No es un libro mayor ni ejecuta transferencias bancarias.</p>
    {editor && <PurchaseEditor record={editor} orders={data.orders || []} onSave={save} onClose={() => setEditor(null)} />}
    {action && <Modal title={action.type === 'delete' ? '¿Eliminar el borrador?' : 'Cancelar compra no pagada'} onClose={() => setAction(null)}><p>{action.type === 'delete' ? 'Se elimina la solicitud sin aprobar y su estimación presupuestaria.' : 'Se conserva el registro y su historial, y se libera el importe comprometido del presupuesto.'}</p><p><strong>{action.record.description}</strong> · {fmt(action.record.amount)}</p>{action.type === 'cancel' && <Field label="Motivo de cancelación"><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={1000} rows={3} /></Field>}{actionError && <p role="alert" className="field-error">{actionError}</p>}<div className="modal-footer"><button className="button secondary" onClick={() => setAction(null)}>Conservar compra</button><button className="button danger" onClick={runAction}>{action.type === 'delete' ? 'Eliminar borrador' : 'Confirmar cancelación'}</button></div></Modal>}
  </div>;
}
