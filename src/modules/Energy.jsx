import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Droplets, Flame, Leaf, Pencil, Plus, Trash2, TrendingUp, Zap } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Modal, Field, exportWorkbook, uid, money, todayISO } from '../shared';
import DailyEnergy from './DailyEnergy';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const METERS = {
  electricity: { label: 'Electricidad', key: 'electricityKwh', rate: 'electricityRate', unit: 'kWh', color: '#5367ed', icon: Zap },
  water: { label: 'Agua', key: 'waterM3', rate: 'waterRate', unit: 'm³', color: '#0e9ec9', icon: Droplets },
  gas: { label: 'Gas · kg histórico', key: 'gasKg', rate: 'gasRate', unit: 'kg', color: '#ec9143', icon: Flame },
  gasLiquid: { label: 'Gas líquido · litros', key: 'gasL', rate: 'gasRateL', unit: 'L', color: '#dd9146', icon: Flame },
  gasVolume: { label: 'Gas volumétrico · m³', key: 'gasM3', rate: 'gasRateM3', unit: 'm³', color: '#b570c7', icon: Flame },
  waste: { label: 'Residuos', key: 'wasteTotal', unit: 'kg', color: '#20a37a', icon: Leaf },
};
const WASTE = [
  ['cardboardKg', 'Cartón', true], ['plasticKg', 'Plástico', true], ['glassKg', 'Vidrio', true], ['metalKg', 'Otros metales', true], ['aluminumKg', 'Aluminio', true], ['greaseTrapKg', 'Grasa de trampas', false], ['organicKg', 'Orgánicos', false], ['nonRecoverableKg', 'No valorizables', false],
];
const nf = (value, digits = 1) => value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('es-CR', { maximumFractionDigits: digits }).format(value);
const ratio = (amount, denominator) => amount != null && Number.isFinite(amount) && denominator > 0 ? amount / denominator : null;
const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
const amount = (record, meter) => !record ? null : meter === 'waste' ? WASTE.reduce((sum, [key]) => sum + Number(record[key] || 0), 0) : record[METERS[meter].key] == null || record[METERS[meter].key] === '' ? null : Number(record[METERS[meter].key]);
const occupiedNights = (record) => record.rooms * record.days * record.occupancy / 100;

export function seedEnergy() {
  const now = new Date(`${todayISO()}T12:00:00`);
  const year = now.getFullYear();
  const monthlyKwh = [121000, 119500, 127000, 124500, 126000, 122000, 128000, 125000, 124000, 160000, 129000, 130000];
  const energyRecords = Array.from({ length: now.getMonth() + 1 }, (_, index) => {
    const month = index + 1;
    const days = daysInMonth(year, month);
    const occupancy = [71, 74, 82, 80, 72, 68, 78, 81, 76, 77, 79, 85][index];
    const roomNights = 123 * days * occupancy / 100;
    return {
      id: `energy-${year}-${month}`, year, month, rooms: 123, days, occupancy,
      guestNights: Math.round(roomNights * 1.8), plates: Math.round(roomNights * 4.3), totalM2: 123 * 28,
      electricityKwh: monthlyKwh[index], electricityRate: 0.14,
      waterM3: Math.round(roomNights * 0.65), waterRate: 2.3,
      gasKg: Math.round(roomNights * 0.38), gasRate: 1.25,
      cardboardKg: 180 + index * 3, plasticKg: 95 + index * 2, glassKg: 120 + index * 3,
      metalKg: 25 + index, organicKg: 480 + index * 6, nonRecoverableKg: 210 + index * 3,
    };
  });
  return { energyRecords, energyThreshold: 20 };
}

function EmptyMonth({ onAdd }) {
  return <div className="empty-state"><TrendingUp size={30} /><h3>Este mes todavía no tiene mediciones</h3><p>Los meses sin registrar se muestran sin datos, no como consumo cero.</p><button className="button primary" onClick={onAdd}><Plus size={16} />Registrar mes</button></div>;
}

function EnergyEditor({ record, records, onClose, onSave, currency }) {
  const [form, setForm] = useState({ aluminumKg: 0, greaseTrapKg: 0, cookingOilL: 0, reusedWaterM3: 0, gasBillingUnit: 'kg', ...record });
  const [error, setError] = useState('');
  const field = (key, label, opts = {}) => <Field label={label}><input type="number" min={opts.min ?? 0} max={opts.max} step={opts.step ?? 'any'} required={!opts.optional} value={form[key] ?? ''} onChange={(event) => setForm((old) => ({ ...old, [key]: event.target.value }))} /></Field>;
  const save = (event) => {
    event.preventDefault();
    const values = { ...form };
    const numericKeys = ['year', 'month', 'rooms', 'days', 'occupancy', 'guestNights', 'plates', 'totalM2', 'electricityKwh', 'electricityRate', 'waterM3', 'waterRate', 'gasKg', 'gasRate', 'gasL', 'gasRateL', 'gasM3', 'gasRateM3', 'cookingOilL', 'reusedWaterM3', ...WASTE.map(([key]) => key)];
    for (const key of numericKeys) values[key] = form[key] == null || form[key] === '' ? null : Number(form[key]);
    if (numericKeys.some((key) => values[key] != null && (!Number.isFinite(values[key]) || values[key] < 0))) { setError('Todas las mediciones deben ser números válidos mayores o iguales a cero.'); return; }
    if (!Number.isInteger(values.year) || values.year < 2000 || values.year > 2100 || values.month < 1 || values.month > 12 || !Number.isInteger(values.month) || values.rooms < 1 || !Number.isInteger(values.rooms) || values.occupancy > 100 || values.totalM2 <= 0) { setError('Revisa el año, mes, habitaciones, ocupación y superficie.'); return; }
    if (records.some((item) => item.id !== values.id && item.year === values.year && item.month === values.month)) { setError('Ese mes ya tiene un registro. Edita la medición existente para evitar duplicados.'); return; }
    values.days = daysInMonth(values.year, values.month);
    onSave(values);
  };
  return <Modal title={record.id ? 'Editar medición mensual' : 'Registrar medición mensual'} onClose={onClose} wide><form onSubmit={save}>
    <div className="modal-body">
      <p className="notice">Registra totales del mes completo. Huéspedes-noche suma los huéspedes alojados cada noche; no es la cantidad de llegadas. Las tarifas usan {currency} por unidad.</p>
      <h3>Actividad del hotel</h3><div className="form-grid">
        {field('year', 'Año', { min: 2000, max: 2100, step: 1 })}
        <Field label="Mes"><select value={form.month} onChange={(event) => setForm((old) => ({ ...old, month: event.target.value }))}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></Field>
        {field('rooms', 'Habitaciones disponibles', { min: 1, step: 1 })}
        {field('occupancy', 'Ocupación mensual (%)', { max: 100 })}
        {field('guestNights', 'Huéspedes-noche', { step: 1 })}
        {field('plates', 'Platos servidos', { step: 1 })}
        {field('totalM2', 'Superficie total de habitaciones (m²)', { min: 0.01 })}
        <div className="field"><span>Superficie promedio por habitación</span><strong>{nf(ratio(Number(form.totalM2), Number(form.rooms)))} m²</strong><small>Días del mes: {daysInMonth(Number(form.year), Number(form.month)) || '—'}</small></div>
      </div>
      <h3>Consumos y tarifas unitarias</h3><div className="form-grid">
        {field('electricityKwh', 'Electricidad consumida (kWh)')}{field('electricityRate', `Tarifa de electricidad (${currency}/kWh)`)}
        {field('waterM3', 'Agua consumida (m³)')}{field('waterRate', `Tarifa de agua (${currency}/m³)`)}
        {field('gasKg', 'Gas histórico consumido (kg)')}{field('gasRate', `Tarifa histórica de gas (${currency}/kg)`)}
        {field('gasL', 'Gas líquido consumido (L)', { optional: true })}{field('gasRateL', `Tarifa de gas líquido (${currency}/L)`, { optional: true })}
        {field('gasM3', 'Gas volumétrico consumido (m³)', { optional: true })}{field('gasRateM3', `Tarifa de gas volumétrico (${currency}/m³)`, { optional: true })}
        <Field label="Unidad facturada del gas"><select value={form.gasBillingUnit} onChange={(event) => setForm((old) => ({ ...old, gasBillingUnit: event.target.value }))}><option value="kg">kg · histórico</option><option value="L">L · líquido</option><option value="m3">m³ · volumétrico</option></select></Field>
        {field('reusedWaterM3', 'Agua reutilizada medida (m³), independiente', { optional: true })}
      </div>
      <h3>Residuos separados (kg)</h3><div className="form-grid">{WASTE.map(([key, label, valued]) => <div key={key}>{field(key, `${label}${valued ? ' · valorizable' : ''}`)}</div>)}</div>
      {field('cookingOilL', 'Aceite reciclado (L), no se suma a kg', { optional: true })}
      <p className="notice">kg, litros de gas líquido y m³ de gas se conservan como mediciones distintas. No se convierten sin un factor del proveedor. El costo general usa únicamente la unidad facturada seleccionada para no duplicar el gas.</p>
      <p className="muted">En esta demo, orgánicos se registran separados y no se suman a los valorizables. Si existe compostaje, debe definirse su clasificación en la configuración de producción.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div><div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">Guardar medición</button></div>
  </form></Modal>;
}

function MonthlyEnergy({ data, setData, notify }) {
  const now = new Date(`${todayISO()}T12:00:00`);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [meter, setMeter] = useState('electricity');
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const records = data.energyRecords || [];
  const currency = data.currency || 'USD';
  const threshold = Number(data.energyThreshold ?? 20);
  const config = METERS[meter];
  const selected = records.find((item) => item.year === year && item.month === month);
  const yearRecords = records.filter((item) => item.year === year).sort((a, b) => a.month - b.month);
  const previous = records.filter((item) => amount(item, meter) != null && item.year * 12 + item.month < year * 12 + month).sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month)).slice(0, 3);
  const baseline = previous.length === 3 ? previous.reduce((sum, item) => sum + amount(item, meter), 0) / 3 : null;
  const current = amount(selected, meter);
  const variation = selected && baseline > 0 ? (current - baseline) / baseline * 100 : null;
  const alert = variation != null && variation > threshold;
  const normalizedPrevious = previous.filter((item) => occupiedNights(item) > 0 && amount(item, meter) != null);
  const normalizedBaseline = normalizedPrevious.length === 3 ? normalizedPrevious.reduce((sum, item) => sum + amount(item, meter) / occupiedNights(item), 0) / 3 : null;
  const normalizedCurrent = selected ? ratio(current, occupiedNights(selected)) : null;
  const normalizedVariation = normalizedBaseline > 0 && normalizedCurrent != null ? (normalizedCurrent - normalizedBaseline) / normalizedBaseline * 100 : null;
  const cost = selected && config.rate && current != null && selected[config.rate] != null ? current * Number(selected[config.rate]) : null;
  const series = useMemo(() => MONTHS.map((label, index) => {
    const record = records.find((item) => item.year === year && item.month === index + 1);
    return { name: label.slice(0, 3), consumo: record ? amount(record, meter) : null, intensidad: record ? ratio(amount(record, meter), occupiedNights(record)) : null };
  }), [records, year, meter]);
  const newRecord = () => setEditor({
    year, month, rooms: data.rooms?.length || 123, days: daysInMonth(year, month), occupancy: 0,
    guestNights: 0, plates: 0, totalM2: data.rooms?.reduce((sum, room) => sum + Number(room.areaM2 || 28), 0) || 3444,
    electricityKwh: 0, electricityRate: 0, waterM3: 0, waterRate: 0, gasKg: 0, gasRate: 0,
    cardboardKg: 0, plasticKg: 0, glassKg: 0, metalKg: 0, organicKg: 0, nonRecoverableKg: 0,
  });
  const save = (record) => {
    const value = { ...record, id: record.id || uid('ENE') };
    setData((old) => ({ ...old, energyRecords: record.id ? (old.energyRecords || []).map((item) => item.id === record.id ? value : item) : [...(old.energyRecords || []), value] }));
    setYear(value.year); setMonth(value.month); setEditor(null); notify('Medición mensual guardada');
  };
  const remove = () => {
    setData((old) => ({ ...old, energyRecords: old.energyRecords.filter((item) => item.id !== selected.id) }));
    setDeleting(false); notify('Medición eliminada');
  };
  const exportData = async () => {
    const rawRows = yearRecords.map((record) => ({
      Año: record.year, Mes: MONTHS[record.month - 1], Habitaciones: record.rooms, Días: record.days,
      'Ocupación %': record.occupancy, 'Habitaciones ocupadas-noche': occupiedNights(record), 'Huéspedes-noche': record.guestNights,
      'Platos servidos': record.plates, 'Superficie habitaciones m²': record.totalM2, 'm² por habitación': ratio(record.totalM2, record.rooms),
      Electricidad_kWh: record.electricityKwh, 'Tarifa electricidad': record.electricityRate, 'Costo electricidad': record.electricityKwh * record.electricityRate,
      Agua_m3: record.waterM3, 'Tarifa agua': record.waterRate, 'Costo agua': record.waterM3 * record.waterRate,
      Gas_kg_histórico: record.gasKg, Gas_líquido_L: record.gasL, Gas_volumétrico_m3: record.gasM3, 'Unidad facturada gas': record.gasBillingUnit || 'kg', 'Tarifa gas kg': record.gasRate, 'Tarifa gas L': record.gasRateL, 'Tarifa gas m3': record.gasRateM3, 'Aceite reciclado L': record.cookingOilL, 'Agua reutilizada m³': record.reusedWaterM3, 'Conciliación diaria': record.dailyReconciledAt, 'Demanda máxima observada kW': record.demandMaxKw, 'Cobertura de conciliación': record.dailyReconcileNote, Moneda: currency,
      ...Object.fromEntries(WASTE.map(([key, label]) => [`${label} kg`, record[key]])), 'Residuos totales kg': amount(record, 'waste'),
      'Valorizables kg': WASTE.filter(([, , valued]) => valued).reduce((sum, [key]) => sum + Number(record[key] || 0), 0),
    }));
    const ratios = yearRecords.flatMap((record) => Object.entries(METERS).map(([key, item]) => {
      const total = amount(record, key);
      return { Año: record.year, Mes: MONTHS[record.month - 1], Recurso: item.label, Unidad: item.unit, Total: total,
        'Por huésped-noche': ratio(total, record.guestNights), 'Por habitación ocupada-noche': ratio(total, occupiedNights(record)),
        'Por habitación mensual': ratio(total, record.rooms), 'Por habitación disponible-noche': ratio(total, record.rooms * record.days),
        'Por m² mensual': ratio(total, record.totalM2), 'Por plato servido': ratio(total, record.plates) };
    }));
    try { await exportWorkbook(`control-energeticos-${year}`, [{ name: 'Mediciones mensuales', rows: rawRows }, { name: 'Factores de consumo', rows: ratios }]); notify('Excel de energéticos generado'); }
    catch { notify('No se pudo generar el Excel. Intenta nuevamente.'); }
  };
  const yearOptions = [...new Set([now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, ...records.map((record) => record.year)])].sort((a, b) => b - a);

  return <div>
    <div className="module-heading"><div><h2>Energéticos</h2><p className="muted">Lo que se mide, se controla. Consumos, costos y factores de actividad del hotel.</p></div><div className="inline-actions"><button className="button secondary" onClick={exportData} disabled={!yearRecords.length}><Download size={16} />Excel anual</button><button className="button primary" onClick={selected ? () => setEditor(selected) : newRecord}>{selected ? <Pencil size={16} /> : <Plus size={16} />}{selected ? 'Editar mes' : 'Registrar mes'}</button></div></div>
    <div className="toolbar"><Field label="Año"><select value={year} onChange={(event) => { setYear(Number(event.target.value)); setDeleting(false); }}>{yearOptions.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Mes"><select value={month} onChange={(event) => { setMonth(Number(event.target.value)); setDeleting(false); }}>{MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></Field><Field label="Recurso"><select value={meter} onChange={(event) => setMeter(event.target.value)}>{Object.entries(METERS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></Field><Field label="Alarma sobre promedio (%)"><input type="number" min="1" max="500" step="1" value={threshold} onChange={(event) => { const value = Number(event.target.value); if (value >= 1 && value <= 500) setData((old) => ({ ...old, energyThreshold: value })); }} /></Field></div>
    <p className="notice">Los datos iniciales son ficticios. Gas histórico en kg, gas líquido en L y gas volumétrico en m³ permanecen separados. Agua en m³, residuos en kg, aceite en L. Los costos son consumo × tarifa unitaria en {currency}, sin cargos adicionales de factura.</p>
    {selected?.dailyReconciledAt && <p className="notice"><strong>Datos conciliados desde lecturas diarias.</strong> {selected.dailyReconcileNote} {selected.gasLiquidSource === 'tank-estimate' ? 'El gas líquido proviene de un balance estimado por porcentajes, no de un contador preciso.' : ''}</p>}
    {selected?.demandMaxKw != null && <p className="notice">Demanda máxima observada registrada: <strong>{nf(selected.demandMaxKw)} kW</strong>. Es independiente de la energía consumida en kWh.</p>}
    {selected ? <>
      <div className="metric-grid"><div className="card metric-card"><span>Consumo de {MONTHS[month - 1].toLowerCase()}</span><strong>{nf(current)} <small>{config.unit}</small></strong><span>{config.label}</span></div><div className="card metric-card"><span>{config.rate ? 'Costo del recurso' : 'Residuos valorizables'}</span><strong>{config.rate ? (cost != null ? money(cost, currency) : '—') : `${nf(WASTE.filter(([, , valued]) => valued).reduce((sum, [key]) => sum + Number(selected[key]), 0))} kg`}</strong><span>{config.rate ? `${nf(selected[config.rate], 4)} ${currency}/${config.unit}` : 'Cartón, plástico, vidrio y metal'}</span></div><div className="card metric-card"><span>Por habitación ocupada-noche</span><strong>{nf(normalizedCurrent, 2)} <small>{config.unit}</small></strong><span>{nf(occupiedNights(selected), 1)} habitaciones ocupadas-noche</span></div><div className="card metric-card"><span>Ocupación del mes</span><strong>{nf(selected.occupancy)}%</strong><span>{selected.rooms} habitaciones · {nf(selected.guestNights, 0)} huéspedes-noche</span></div></div>
      <div className={alert ? 'alert-box' : 'notice'} role={alert ? 'alert' : undefined}>{alert && <AlertTriangle size={20} />}<div><strong>{baseline == null ? 'Aún no hay una base suficiente para comparar.' : variation == null ? 'Promedio previo igual a cero: comparación porcentual no disponible.' : alert ? `Advertencia: consumo ${nf(variation)}% por encima del promedio` : `Variación de consumo: ${variation > 0 ? '+' : ''}${nf(variation)}%`}</strong><p>{baseline != null ? `Referencia: promedio de los 3 meses anteriores registrados (${previous.map((item) => `${MONTHS[item.month - 1].slice(0, 3)} ${item.year}`).reverse().join(', ')}): ${nf(baseline)} ${config.unit}. Umbral: +${threshold}%.` : 'Se necesitan 3 meses anteriores con mediciones. Los meses sin datos se excluyen.'}{normalizedVariation != null && ` Variación por habitación ocupada-noche: ${normalizedVariation > 0 ? '+' : ''}${nf(normalizedVariation)}%.`}</p></div></div>
      <section className="card"><div className="card-header"><div><h3 className="card-title">Factores relevantes de {MONTHS[month - 1].toLowerCase()}</h3><p className="card-subtitle">Cada factor usa el total mensual de {config.label.toLowerCase()} y el denominador indicado.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Factor</th><th>Resultado</th><th>Base de actividad</th></tr></thead><tbody>{[
        ['Por huésped-noche', selected.guestNights, 'huéspedes-noche'],
        ['Por habitación ocupada-noche', occupiedNights(selected), 'habitaciones ocupadas-noche'],
        ['Por habitación disponible-noche', selected.rooms * selected.days, 'habitaciones disponibles-noche'],
        ['Por habitación · mensual', selected.rooms, 'habitaciones'],
        ['Por m² · mensual', selected.totalM2, 'm² de habitaciones'],
        ['Por plato servido', selected.plates, 'platos servidos'],
      ].map(([label, denominator, unit]) => <tr key={label}><td>{label}</td><td><strong>{nf(ratio(current, denominator), 3)} {config.unit}</strong></td><td>{nf(denominator, 1)} {unit}</td></tr>)}</tbody></table></div><p className="muted" style={{ padding: '0 20px 16px' }}>— indica un denominador igual a cero. No se interpreta como consumo cero.</p></section>
    </> : <section className="card"><EmptyMonth onAdd={newRecord} /></section>}
    <div className="module-grid" style={{ marginTop: 20 }}><section className="card chart-card"><div className="card-header"><div><h3 className="card-title">Consumo mensual · {year}</h3><p className="card-subtitle">{config.label} en {config.unit}. Sin registro = sin punto.</p></div></div><div style={{ width: '100%', height: 280 }}><ResponsiveContainer><LineChart data={series} margin={{ top: 10, right: 20, left: 5, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis width={65} tick={{ fontSize: 11 }} tickFormatter={(value) => nf(value, 0)} /><Tooltip formatter={(value) => [`${nf(value)} ${config.unit}`, 'Consumo']} /><Line type="monotone" dataKey="consumo" stroke={config.color} strokeWidth={3} dot={{ r: 4 }} connectNulls={false} /></LineChart></ResponsiveContainer></div></section><section className="card chart-card"><div className="card-header"><div><h3 className="card-title">Consumo por ocupación</h3><p className="card-subtitle">{config.unit} por habitación ocupada-noche. Permite comparar meses con distinta ocupación.</p></div></div><div style={{ width: '100%', height: 280 }}><ResponsiveContainer><BarChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis width={55} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => [`${nf(value, 2)} ${config.unit}`, 'Por hab. ocupada-noche']} /><Bar dataKey="intensidad" fill={config.color} radius={[5, 5, 0, 0]} maxBarSize={32} /></BarChart></ResponsiveContainer></div></section></div>
    {meter === 'waste' && selected && <section className="card chart-card" style={{ marginTop: 20 }}><div className="card-header"><div><h3 className="card-title">Separación de residuos</h3><p className="card-subtitle">{MONTHS[month - 1]} · kilogramos por categoría</p></div></div><div style={{ width: '100%', height: 250 }}><ResponsiveContainer><BarChart data={WASTE.map(([key, label, valued]) => ({ name: label, valorizables: valued ? selected[key] : null, otros: !valued ? selected[key] : null }))} margin={{ right: 20, left: 0, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => `${nf(value)} kg`} /><Legend /><Bar name="Valorizables" dataKey="valorizables" fill="#20a37a" stackId="waste" radius={[5, 5, 0, 0]} /><Bar name="Otros residuos" dataKey="otros" fill="#a3adbc" stackId="waste" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></section>}
    <section className="card" style={{ marginTop: 20 }}><div className="card-header"><div><h3 className="card-title">Registro anual de mediciones</h3><p className="card-subtitle">Selecciona un mes para revisar sus factores. No se suman unidades diferentes.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Mes</th><th>Ocupación</th><th>Electricidad · kWh</th><th>Agua · m³</th><th>Gas histórico · kg</th><th>Gas líquido · L</th><th>Gas volumétrico · m³</th><th>Residuos · kg</th><th>Costo recursos · {currency}</th><th>Acciones</th></tr></thead><tbody>{yearRecords.map((record) => <tr key={record.id}><td><button className="button ghost small" onClick={() => { setMonth(record.month); setDeleting(false); }}>{MONTHS[record.month - 1]}</button></td><td>{nf(record.occupancy)}%</td><td>{nf(record.electricityKwh)}</td><td>{nf(record.waterM3)}</td><td>{nf(record.gasKg)}</td><td>{nf(record.gasL)}</td><td>{nf(record.gasM3)}</td><td>{nf(amount(record, 'waste'))}</td><td>{money(record.electricityKwh * record.electricityRate + record.waterM3 * record.waterRate + (record.gasBillingUnit === 'L' ? Number(record.gasL || 0) * Number(record.gasRateL || 0) : record.gasBillingUnit === 'm3' ? Number(record.gasM3 || 0) * Number(record.gasRateM3 || 0) : Number(record.gasKg || 0) * Number(record.gasRate || 0)), currency)}</td><td><button className="button secondary small" aria-label={`Editar ${MONTHS[record.month - 1]}`} onClick={() => setEditor(record)}><Pencil size={14} />Editar</button></td></tr>)}{!yearRecords.length && <tr><td colSpan={10}>No hay mediciones registradas para {year}.</td></tr>}</tbody></table></div></section>
    {selected && <div className="inline-actions" style={{ marginTop: 18 }}>{deleting ? <><span>¿Eliminar las mediciones de {MONTHS[month - 1]} {year}?</span><button className="button danger small" onClick={remove}>Sí, eliminar mes</button><button className="button secondary small" onClick={() => setDeleting(false)}>Cancelar</button></> : <button className="button ghost danger small" onClick={() => setDeleting(true)}><Trash2 size={15} />Eliminar mes seleccionado</button>}</div>}
    {editor && <EnergyEditor key={editor.id || 'new-energy'} record={editor} records={records} currency={currency} onClose={() => setEditor(null)} onSave={save} />}
  </div>;
}


export default function Energy(props) {
  const [view, setView] = useState('daily');
  return <><div className="module-tabs" role="group" aria-label="Vista de energéticos"><button className={`button ${view === 'daily' ? 'primary' : 'secondary'}`} aria-pressed={view === 'daily'} onClick={() => setView('daily')}>Lecturas diarias</button><button className={`button ${view === 'monthly' ? 'primary' : 'secondary'}`} aria-pressed={view === 'monthly'} onClick={() => setView('monthly')}>Indicadores mensuales</button></div>{view === 'daily' ? <DailyEnergy {...props} /> : <MonthlyEnergy {...props} />}</>;
}
