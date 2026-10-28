import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, ClipboardList, Wrench, HardHat, BedDouble, Zap, Camera, TrendingUp, Wallet, Menu, X, ChevronRight, ArrowUpRight, ArrowRight, CircleHelp, Download, RotateCcw, Database, CheckCircle2, AlertTriangle, Building2, ShieldCheck, Sparkles, Users, ShoppingCart, BookOpen, FileBarChart2, LogOut, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area } from 'recharts';
import WorkOrders, { seedOrders, getRecurringFaults } from './modules/WorkOrders';
import Maintenance, { seedMaintenance } from './modules/Maintenance';
import Energy, { seedEnergy } from './modules/Energy';
import Finance, { seedFinance } from './modules/Finance';
import Inspections, { seedInspections } from './modules/Inspections';
import { Modal, AREAS, TEAM, todayISO, exportWorkbook } from './shared';
import { loadData, saveData } from './storage';
import { AuthProvider, AuthGate, useAuth } from './auth';
import { loadCloudData, syncCloudData, rebaseCloudChange } from './cloud';
import { managerRole } from './domain';
import TeamPerformance from './modules/TeamPerformance';
import PurchaseOrders, { seedPurchaseOrders } from './modules/PurchaseOrders';
import ServiceSequences from './modules/ServiceSequences';
import ExecutiveReports from './modules/ExecutiveReports';
import { seedProtocols } from './protocols';
import { seedDailyEnergy } from './modules/DailyEnergy';

const PAGES = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard, group: 'OPERACIÓN' },
  { id: 'orders', label: 'Solicitudes de trabajo', icon: ClipboardList },
  { id: 'performance', label: 'Rendimiento del equipo', icon: Users },
  { id: 'preventive', label: 'Mantenimiento preventivo', icon: Wrench },
  { id: 'corrective', label: 'Plan correctivo', icon: HardHat },
  { id: 'rooms', label: 'Habitaciones 360', icon: BedDouble },
  { id: 'protocols', label: 'Secuencias de servicio', icon: BookOpen },
  { id: 'energy', label: 'Energéticos', icon: Zap, group: 'CONTROL Y PLANIFICACIÓN' },
  { id: 'rounds', label: 'Recorridas', icon: Camera },
  { id: 'capex', label: 'FF&E / CAPEX', icon: TrendingUp },
  { id: 'purchases', label: 'Órdenes de compra', icon: ShoppingCart },
  { id: 'budget', label: 'Presupuesto', icon: Wallet },
  { id: 'weekly', label: 'Informe semanal', icon: FileBarChart2, group: 'INFORMES' },
  { id: 'monthly', label: 'Ejecutivo mensual', icon: FileBarChart2 },
];
function initialData() {
  return { schemaVersion: 2, createdAt: new Date().toISOString(), orders: seedOrders(), ...seedMaintenance(), ...seedInspections(), ...seedEnergy(), ...seedFinance(), ...seedPurchaseOrders(), ...seedDailyEnergy(), ...seedProtocols(), reportSnapshots: [] };
}
export function migrateData(saved) {
  const defaults = initialData();
  if (!saved || ![1, 2].includes(saved.schemaVersion)) return defaults;
  return { ...defaults, ...saved, schemaVersion: 2 };
}
function Overview({ data, go }) {
  const active = data.orders.filter((o) => o.status !== 'completed');
  const closed = data.orders.filter((o) => o.status === 'completed');
  const overdue = data.preventivePlans.filter((p) => p.nextDate <= todayISO());
  const recurring = getRecurringFaults(data.orders);
  const rooms = new Set(data.roomHistory.map((r) => r.roomId)).size;
  const progress = data.orders.length ? Math.round(data.orders.reduce((s, o) => s + Number(o.progress || 0), 0) / data.orders.length) : 0;
  const areas = AREAS.map((name) => ({ name, Activos: active.filter((o) => o.area === name).length, Cerrados: closed.filter((o) => o.area === name).length }));
  const energy = [...data.energyRecords].sort((a, b) => a.year - b.year || a.month - b.month);
  const energyChart = energy.slice(-6).map((r) => ({ name: new Intl.DateTimeFormat('es', { month: 'short' }).format(new Date(r.year, r.month - 1, 1)), kWh: r.electricityKwh }));
  const before = energy.slice(-4, -1);
  const baseline = before.length === 3 ? before.reduce((s, r) => s + r.electricityKwh, 0) / 3 : 0;
  const energyWarning = baseline > 0 && energy.at(-1)?.electricityKwh > baseline * (1 + data.energyThreshold / 100);
  return <>
    <div className="page-heading"><div><p className="eyebrow">INGENIERÍA HOTELERA · VISTA GENERAL</p><h1>Todo bajo control.</h1><p className="page-description">De la primera solicitud al último detalle. Tu hotel, en una sola vista.</p></div><button className="button primary" onClick={() => go('orders')}><ClipboardList size={17} />Gestionar solicitudes<ArrowUpRight size={16} /></button></div>
    <div className="stats-grid">{[
      ['Trabajos activos', active.length, ClipboardList, 'blue', `${closed.length} cerrados con historial`, 'orders'],
      ['Avance de trabajos', `${progress}%`, TrendingUp, 'green', 'Promedio de todas las solicitudes', 'orders'],
      ['Preventivos por atender', overdue.length, Wrench, 'orange', 'Programados para hoy o vencidos', 'preventive'],
      ['Habitaciones revisadas', `${rooms}/123`, BedDouble, 'purple', 'Revisiones 360 finalizadas', 'rooms'],
    ].map(([label, value, Icon, color, note, target]) => <button className="stat-card" key={label} onClick={() => go(target)}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${color}`}><Icon size={19} /></span></div><div className="stat-value">{value}<ArrowUpRight size={17} /></div><div className="stat-bottom">{note}</div></button>)}</div>
    <div className="overview-grid engineering-overview"><div className="overview-main">
      <section className="card chart-card"><div className="card-header"><div><h2 className="card-title">El pulso de tu operación</h2><p className="card-subtitle">Trabajos activos y cerrados por área técnica.</p></div><span className="demo-pill">En este dispositivo</span></div><div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={areas} margin={{ top: 15, right: 15, left: -20, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f5" /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} tickFormatter={(value) => ({ Infraestructura: "Infraest.", Electromecánica: "Electromec.", Habitaciones: "Habitac.", "Servicios generales": "Servicios" })[value] || value} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="Activos" fill="#5367ed" radius={[5, 5, 0, 0]} maxBarSize={34} /><Bar dataKey="Cerrados" fill="#99d6bd" radius={[5, 5, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></div><div className="chart-legend"><span><i style={{ background: '#5367ed' }} />Activos</span><span><i style={{ background: '#99d6bd' }} />Cerrados</span></div></section>
      <section className="card dashboard-orders"><div className="card-header"><div><h2 className="card-title">En el radar del equipo</h2><p className="card-subtitle">Solicitudes abiertas, ordenadas por prioridad.</p></div><button className="button ghost small" onClick={() => go('orders')}>Ver todas<ArrowRight size={15} /></button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Trabajo / ubicación</th><th>Responsable</th><th>Prioridad</th><th>Avance</th></tr></thead><tbody>{[...active].sort((a, b) => ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority)).slice(0, 5).map((o) => <tr key={o.id}><td><button className="request-title" onClick={() => go('orders')}>{o.title}</button><div className="request-id">{o.id} · {o.building}{o.location ? ` · ${o.location}` : ''}</div></td><td><span className="member-inline"><span className="mini-avatar">{(TEAM.find((m) => m.id === o.owner)?.name || 'Sin asignar').split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>{TEAM.find((m) => m.id === o.owner)?.name.split(' ')[0] || 'Sin asignar'}</span></td><td><span className={`badge ${o.priority}`}>{({ high: 'Alta', medium: 'Media', low: 'Baja' })[o.priority]}</span></td><td><div className="table-progress"><span>{o.progress}%</span><div className="progress-track"><div className="progress-fill" style={{ width: `${o.progress}%` }} /></div></div></td></tr>)}</tbody></table>{!active.length && <div className="empty-state"><CheckCircle2 /><h3>Todo al día</h3><p>No hay trabajos abiertos.</p></div>}</div></section>
      <section className="card chart-card"><div className="card-header"><div><h2 className="card-title">La energía también cuenta</h2><p className="card-subtitle">Electricidad · últimos meses registrados · kWh.</p></div><button className="button ghost small" onClick={() => go('energy')}>Ver energéticos<ArrowRight size={15} /></button></div><div style={{ height: 210, width: '100%', minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={energyChart} margin={{ top: 15, right: 20, left: 0, bottom: 0 }}><defs><linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5367ed" stopOpacity={0.2} /><stop offset="100%" stopColor="#5367ed" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f5" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} /><Tooltip formatter={(v) => [`${Number(v).toLocaleString('es-CR')} kWh`, 'Electricidad']} /><Area type="monotone" dataKey="kWh" stroke="#5367ed" fill="url(#energyGradient)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></div></section>
    </div><div className="overview-side">
      <section className="card attention-card"><div className="card-header"><div><h2 className="card-title">Necesita una mirada</h2><p className="card-subtitle">Señales para actuar a tiempo.</p></div><span className="attention-icon"><AlertTriangle size={19} /></span></div>{[
        [recurring.length + ' averías recurrentes', 'Más de 3 reportes del mismo síntoma y ubicación.', 'orders', 'red'],
        [overdue.length + ' preventivos por atender', 'Revisa fechas y completa los checklists.', 'preventive', 'amber'],
        [energyWarning ? 'Consumo eléctrico elevado' : 'Consumo eléctrico sin alarma', baseline ? `Referencia: 3 meses previos. Umbral +${data.energyThreshold}%.` : 'Faltan mediciones para establecer el promedio.', 'energy', energyWarning ? 'red' : 'green'],
      ].map(([title, text, target, color]) => <button className="attention-item" key={target} onClick={() => go(target)}><span className={`attention-dot ${color}`} /><div><strong>{title}</strong><p>{text}</p></div><ChevronRight size={17} /></button>)}</section>
      <section className="card room-overview"><div className="card-header"><div><h2 className="card-title">Cada habitación importa.</h2><p className="card-subtitle">Mantenimiento 360 · derecha a izquierda.</p></div></div><div className="room-illustration"><BedDouble size={64} strokeWidth={1.25} /><span className="room-circle circle-one" /><span className="room-circle circle-two" /><span className="room-spark"><Sparkles size={21} /></span></div><div className="room-overview-content"><strong>123 espacios. Un mismo estándar.</strong><p>Puertas, instalaciones y cada detalle que hace una estancia segura.</p><button className="button secondary" onClick={() => go('rooms')}>Revisar habitaciones<ArrowRight size={15} /></button></div></section>
      <div className="quiet-note"><span>LO QUE SE MIDE, SE CONTROLA.</span><p>Decisiones más claras.<br />Un hotel que funciona mejor.</p><span className="quiet-dots"><i /><i /><i /></span></div>
    </div></div>
  </>;
}

function SigmaApplication() {
  const { profile, configured, signOut } = useAuth();
  const isManager = managerRole(profile);
  const visiblePages = PAGES.filter((item) => isManager || item.id === 'orders' || (profile.role === 'technician' && item.id === 'protocols'));
  const dataRef = useRef(null), savedRef = useRef(null), queuedRef = useRef(null), saveQueue = useRef(Promise.resolve());
  const [data, setData] = useState(null);
  const [page, setPage] = useState(isManager ? 'overview' : 'orders');
  const [mobileNav, setMobileNav] = useState(false);
  const [smallScreen, setSmallScreen] = useState(() => window.innerWidth < 900);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState('');
  const [storageState, setStorageState] = useState('loading');
  const [exporting, setExporting] = useState(false);
  const navRef = useRef(null), mobileButton = useRef(null), toastTimer = useRef(null);
  const notify = (message) => { clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(''), 6500); };
  useEffect(() => {
    let mounted = true;
    const operation = configured ? loadCloudData(initialData, profile) : loadData().then(migrateData);
    operation.then((loaded) => {
      if (!mounted) return;
      dataRef.current = loaded; savedRef.current = loaded; queuedRef.current = loaded;
      setData(loaded); setStorageState('saved');
    }).catch((error) => {
      if (!mounted) return;
      if (configured) { notify(`No se pudieron cargar los datos compartidos: ${error.message}`); setStorageState('error'); }
      else { const fallback = initialData(); dataRef.current = fallback; queuedRef.current = fallback; setData(fallback); setStorageState('error'); }
    });
    return () => { mounted = false; };
  }, [profile.id, configured]);
  useEffect(() => {
    if (!data || data === savedRef.current) return;
    dataRef.current = data;
    const previous = queuedRef.current; const intended = data;
    queuedRef.current = intended;
    setStorageState('saving');
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      const base = savedRef.current || previous;
      const desired = configured ? rebaseCloudChange(previous, intended, base) : intended;
      const result = configured ? (desired === base ? base : await syncCloudData(base, desired, profile)) : (await saveData(intended), intended);
      savedRef.current = result;
      if (dataRef.current === intended) {
        queuedRef.current = result; dataRef.current = result;
        if (result !== intended) setData(result);
        setStorageState('saved');
      }
    }).catch((error) => { setStorageState('error'); notify(`No se guardaron los últimos cambios: ${error.message}. Conserva una copia antes de salir.`); });
  }, [data, configured, profile.id]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 899px)');
    const handler = () => { setSmallScreen(query.matches); if (!query.matches) setMobileNav(false); };
    query.addEventListener('change', handler); return () => query.removeEventListener('change', handler);
  }, []);
  useEffect(() => {
    if (!mobileNav) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const items = () => [...navRef.current.querySelectorAll('button')].filter((el) => el.getClientRects().length);
    items()[0]?.focus();
    const handler = (e) => { const list = items(); if (e.key === 'Escape') setMobileNav(false); if (e.key === 'Tab' && e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1)?.focus(); } else if (e.key === 'Tab' && !e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0]?.focus(); } };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handler); mobileButton.current?.focus(); };
  }, [mobileNav]);
  const go = (id) => { if (!visiblePages.some((item) => item.id === id)) return; setPage(id); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const backup = () => { if (!isManager) return; const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `sigma-ing-respaldo-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Copia descargada con datos, historial y fotografías.'); };
  const exportAll = async () => {
    if (!isManager) return;
    setExporting(true);
    try { await exportWorkbook(`sigma-ing-ingenieria-${todayISO()}`, [
      { name: 'Solicitudes', rows: data.orders.map((o) => ({ ID: o.id, Trabajo: o.title, Descripción: o.description, Área: o.area, Edificio: o.building, Habitación: o.roomId || '', Ubicación: o.location || '', Responsable: TEAM.find((m) => m.id === o.owner)?.name || '', Prioridad: o.priority, Estado: o.status, 'Avance %': o.progress, Avería: o.fault, Origen: o.source, Creación: o.createdAt, Inicio: o.startedAt, Cierre: o.closedAt })) },
      { name: 'Preventivos', rows: data.preventivePlans.map((p) => ({ ID: p.id, Equipo: p.equipment, Área: p.area, Edificio: p.building, Frecuencia: p.frequency, 'Próxima revisión': p.nextDate, Checklist: p.checks.join('; ') })) },
      { name: 'Historial preventivo', rows: data.preventiveRuns.map((r) => ({ ID: r.id, Plan: r.planId, Fecha: r.date, Edificio: r.building, Significativos: r.significant, Correctivos: r.orderIds?.join('; '), Checklist: r.checks })) },
      { name: 'Habitaciones', rows: data.rooms.map((r) => ({ ID: r.id, Habitación: r.number, Edificio: r.building, 'Superficie m²': r.areaM2 })) },
      { name: 'Historial 360', rows: data.roomHistory.map((r) => ({ ...r, photos: undefined, 'Cantidad de fotos': r.photos?.length || 0 })) },
      { name: 'Energéticos', rows: data.energyRecords },
      { name: 'Recorridas', rows: data.rounds.map((r) => ({ ...r, photos: undefined, 'Cantidad de fotos': r.photos?.length || 0 })) },
      { name: 'FF&E CAPEX', rows: data.capex }, { name: 'Movimientos presupuesto', rows: data.budgetEntries }, { name: 'Presupuestos mensuales', rows: data.monthlyBudgets },
      { name: 'Reportes técnicos', rows: data.orders.flatMap((order) => (order.reports || []).map(({ photos, ...report }) => ({ Solicitud: order.id, ...report, Fotos: photos?.length || 0 }))), images: data.orders.flatMap((order) => (order.reports || []).flatMap((report) => (report.photos || []).map((photo) => ({ url: photo.url, name: `${order.id} · ${report.authorName || ''} · ${photo.name || ''}` })))) },
      { name: 'Lecturas diarias', rows: data.dailyReadings || [] },
      { name: 'Cargas GLP', rows: data.gasDeliveries || [] },
      { name: 'Residuos diarios', rows: data.wasteReadings || [] },
      { name: 'Órdenes de compra', rows: data.purchaseOrders || [] },
      { name: 'Secuencias de servicio', rows: (data.protocols || []).map((protocol) => ({ ID: protocol.id, Título: protocol.title, Categoría: protocol.category, Versión: protocol.version, Revisión: protocol.reviewStatus, Fuente: protocol.sourceFiles?.join('; '), Pasos: protocol.steps, Contactos: protocol.contacts })) },
      { name: 'Bitácora de secuencias', rows: (data.protocolRuns || []).map(({ photos, ...run }) => ({ ...run, Fotos: photos?.length || 0 })) },
      { name: 'Informes ejecutivos', rows: data.reportSnapshots || [] },
    ]); notify('Excel general descargado. Cada módulo también exporta sus indicadores.'); }
    catch { notify('No se pudo generar el Excel. Inténtalo nuevamente.'); }
    finally { setExporting(false); }
  };
  if (!data) return <div className="app-loading"><img src="/sigma-logo.png" alt="SIGMA" width="300" /><p>{storageState === "error" ? "No se pudo cargar el espacio de trabajo. Revisa la conexión y vuelve a intentarlo." : "Preparando tu espacio de ingeniería…"}</p>{storageState === "error" && <button className="button secondary" onClick={() => window.location.reload()}>Reintentar</button>}</div>;
  const props = { data, setData, notify, user: profile, currentUser: profile };
  return <div className="app-shell"><a className="skip-link" href="#main-content">Saltar al contenido</a>{mobileNav && <div className="sidebar-backdrop" onClick={() => setMobileNav(false)} />}
    <aside ref={navRef} className={`sidebar ${mobileNav ? 'open' : ''}`} aria-label="Menú de ingeniería" inert={smallScreen && !mobileNav ? true : undefined}>
      <div className="brand"><img src="/sigma-logo.png" alt="SIGMA · Engineering Management System" className="sigma-sidebar-logo" /><button className="icon-button mobile-only" aria-label="Cerrar menú" onClick={() => setMobileNav(false)}><X size={20} /></button></div>
      <div className="hotel-label"><Building2 size={15} /><span>Ingeniería hotelera</span><span className="hotel-label-count">123</span></div>
      <nav className="nav-list">{visiblePages.map(({ id, label, icon: Icon, group }) => <div key={id}>{group && <div className="workspace-label">{group}</div>}<button className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}><Icon className="nav-icon" size={18} /><span>{label}</span>{id === 'orders' && <span className="nav-count">{data.orders.filter((o) => o.status !== 'completed').length}</span>}</button></div>)}</nav>
      <div className="sidebar-footer"><div className="demo-card"><span className="demo-card-icon"><ShieldCheck size={19} /></span><h3>Ingeniería estratégica.</h3><p>Control inteligente. Excelencia operativa.</p>{isManager && <button onClick={backup}><Download size={14} />Descargar respaldo</button>}</div><div className="sidebar-user"><span className="avatar workspace-avatar">{profile.name?.charAt(0) || "S"}</span><div className="user-info"><strong>{profile.name}</strong><span>{({ admin: "Administración", coordinator: "Coordinación", technician: "Técnico", requester: "Solicitante" })[profile.role]}</span></div><button className="icon-button" aria-label="Cerrar sesión" onClick={() => signOut()}><LogOut size={17} /></button></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="topbar-left"><button ref={mobileButton} className="icon-button mobile-menu-button" aria-label="Abrir menú" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={22} /></button><span className="breadcrumb"><span>Mi hotel</span><ChevronRight size={14} /><strong>{PAGES.find((p) => p.id === page).label}</strong></span></div><div className="topbar-right"><span className={`local-storage-status ${storageState}`}><Database size={14} />{storageState === 'saved' ? (configured ? 'Sincronizado' : 'Guardado local') : storageState === 'saving' ? 'Guardando…' : 'Sin guardar'}</span><span className="topbar-divider" /><button className="icon-button" aria-label="Ayuda y datos de la demostración" onClick={() => setDialog('help')}><CircleHelp size={20} /></button><span className="avatar top-avatar">{profile.name?.charAt(0) || "S"}</span></div></header>
      <main className="main-content" id="main-content" tabIndex={-1}>
        <div className="demo-banner"><span className="demo-tag"><span />{configured ? "ESPACIO COMPARTIDO" : "DEMOSTRACIÓN LOCAL"}</span><p>{configured ? "Acceso personal con permisos por rol y datos compartidos." : "Perfiles de prueba · datos en este navegador · sin cuentas multiusuario reales."}</p><button aria-label="Información de la demostración" onClick={() => setDialog('help')}><ArrowUpRight size={17} /></button></div>
        {storageState === 'error' && <div className="alert-box" role="alert"><AlertTriangle size={20} /><p>No se pudo guardar. Los cambios están solo en memoria. Descarga una copia antes de cerrar.</p><button className="button secondary small" onClick={backup}>Descargar respaldo</button></div>}
        {page !== 'overview' && <div className="module-eyebrow"><span className="eyebrow">INGENIERÍA HOTELERA</span><h1>{PAGES.find((p) => p.id === page).label}</h1></div>}
        {page === 'overview' && <Overview data={data} go={go} />}
        {(page === 'orders' || page === 'corrective') && <WorkOrders key={`${page}-${profile.id}`} {...props} mode={page === 'orders' ? 'orders' : 'corrective'} />}
        {page === 'performance' && <TeamPerformance {...props} />}{page === 'preventive' && <Maintenance {...props} />}{page === 'energy' && <Energy {...props} />}{page === 'protocols' && <ServiceSequences {...props} />}{page === 'purchases' && <PurchaseOrders {...props} />}{(page === 'weekly' || page === 'monthly') && <ExecutiveReports key={page} {...props} mode={page} />}
        {(page === 'rooms' || page === 'rounds') && <Inspections key={page} {...props} mode={page} />}
        {(page === 'capex' || page === 'budget') && <Finance key={page} {...props} mode={page} />}
        <footer className="main-footer"><span><span className="sigma-mark">Σ</span>SIGMA <span className="footer-divider">/</span> Lo que se mide, se controla.</span><button className="footer-action" onClick={() => setDialog('help')}>Acerca de esta versión<ArrowUpRight size={12} /></button></footer>
      </main></div>
    {dialog === 'help' && <Modal title="SIGMA · Sistema Integral de Gestión de Ingeniería" onClose={() => setDialog(null)} wide><div className="help-content"><span className="help-illustration"><Building2 size={32} /></span><h3>Engineering Management System</h3><p>Solicitudes, responsables por área, mantenimiento preventivo y correctivo, 123 habitaciones, indicadores de consumo, recorridas con fotos y planificación financiera.</p><div className="help-notice"><Database size={20} /><p><strong>Conservación y acceso a la información.</strong> {configured ? "Los datos compartidos se protegen con permisos por rol en la base de datos. La retención y las copias de seguridad deben configurarse y comprobarse en el servicio de datos; publicar la web por sí solo no garantiza un archivo anual." : "El historial local no se depura automáticamente, pero depende del espacio del navegador y se pierde si borras los datos del sitio. Los perfiles son una demostración y no se sincronizan entre dispositivos. Para cuentas reales y conservación de uno o dos años se necesita activar la base de datos y sus respaldos."}</p></div><p>Las habitaciones 001–123, los edificios, las cuentas y el equipo inicial son ejemplos configurables. Los informes y Excel incluyen evidencia fotográfica; el respaldo JSON conserva los registros y las fotos. Las secuencias de servicio son plantillas pendientes de revisión y aprobación por el hotel.</p><div className="inline-actions">{isManager && <><button className="button primary" onClick={exportAll} disabled={exporting}><Download size={16} />{exporting ? 'Generando…' : 'Exportar todo a Excel'}</button><button className="button secondary" onClick={backup}><Database size={16} />Copia con fotos</button></>}</div><hr /><button className="button ghost danger small" disabled={configured || !isManager} onClick={() => setDialog('reset')}><RotateCcw size={15} />Restablecer datos de ejemplo</button></div></Modal>}
    {dialog === 'reset' && !configured && isManager && <Modal title="¿Restablecer los datos de ejemplo?" onClose={() => setDialog(null)}><p>Se eliminarán los cambios y fotografías de este navegador. Descarga una copia antes de continuar.</p><div className="modal-footer"><button className="button secondary" onClick={() => setDialog(null)}>Cancelar</button><button className="button danger" onClick={() => { setData(initialData()); setDialog(null); setPage('overview'); notify('Demostración restablecida'); }}>Sí, restablecer</button></div></Modal>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={19} /><span>{toast}</span><button aria-label="Cerrar notificación" onClick={() => setToast('')}><X size={16} /></button></div>}
  </div>;
}

export default function App() {
  return <AuthProvider><AuthGate><AuthenticatedApplication /></AuthGate></AuthProvider>;
}
function AuthenticatedApplication() {
  const { profile, configured } = useAuth();
  return <SigmaApplication key={`${configured ? 'cloud' : 'local'}-${profile.id}`} />;
}
