import { createClient } from '@supabase/supabase-js';

const env = import.meta.env || {};
const url = env.VITE_SUPABASE_URL || '';
const key = env.VITE_SUPABASE_ANON_KEY || '';
let client = null, configurationError = '';
if (Boolean(url) !== Boolean(key)) configurationError = 'La conexión está incompleta: configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel y vuelve a desplegar.';
else if (url && key) { try { client = createClient(url, key); } catch { configurationError = 'La URL o la clave pública de Supabase no tienen un formato válido. Revisa las variables y vuelve a desplegar.'; } }
export const cloudConfigured = Boolean(client);
export const cloudConfigurationError = configurationError;
export const supabase = client;

export const profileFromRow = (row) => row ? ({ id: row.id, name: row.name, role: row.role, memberId: row.member_id || '', area: row.area || '' }) : null;
const manager = (profile) => ['admin', 'coordinator'].includes(profile?.role);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rowId = (row) => String(row.id || (row.year && row.month ? `${row.year}-${String(row.month).padStart(2, '0')}` : ''));
const clean = (row) => { const { _cloudRevision, ...payload } = row; return payload; };
const orderFromRow = (row) => ({ ...row.payload, id: row.id, createdBy: row.created_by, owner: row.assigned_member_id || '', createdAt: row.created_at, _cloudRevision: row.revision });
const moduleFromRow = (row) => ({ ...row.payload, _cloudRevision: row.revision });
const checked = (result) => { if (result.error) throw new Error(result.error.message || 'No se pudo sincronizar con el servidor.'); return result.data; };

/** Apply only a queued local change to the last confirmed server snapshot.
 * Unchanged fields, server revisions, and already-recorded author stamps survive.
 * This rebases this client's queue; the RPC still rejects a newer remote revision.
 */
export function rebaseCloudChange(previous, intended, authoritative) {
  const historyNames = new Set(['reports', 'findings', 'updates']);
  const keyOf = (row) => row && typeof row === 'object'
    ? String(row.reportId || row.id || (row.year && row.month ? `${row.year}-${String(row.month).padStart(2, '0')}` : row.at || '')) : '';
  const keyed = (rows) => Array.isArray(rows) && rows.every((row) => keyOf(row)) && new Set(rows.map(keyOf)).size === rows.length;
  function apply(before, after, confirmed, name = '') {
    if (same(before, after)) return confirmed;
    if (Array.isArray(before) && Array.isArray(after) && Array.isArray(confirmed) && keyed(before) && keyed(after) && keyed(confirmed)) {
      const old = new Map(before.map((row) => [keyOf(row), row]));
      const local = new Map(after.map((row) => [keyOf(row), row]));
      const server = new Map(confirmed.map((row) => [keyOf(row), row]));
      const merged = new Map(server);
      if (!historyNames.has(name)) for (const id of old.keys()) if (!local.has(id)) merged.delete(id);
      for (const [id, row] of local) {
        if (!old.has(id)) { if (!server.has(id)) merged.set(id, row); }
        else if (!historyNames.has(name) && !same(old.get(id), row)) {
          if (!server.has(id)) throw new Error(`El registro ${id} ya no está disponible. Actualiza antes de guardar.`);
          merged.set(id, apply(old.get(id), row, server.get(id), name));
        }
      }
      const result = [...merged.values()];
      return same(result, confirmed) ? confirmed : result;
    }
    if (before && after && confirmed && !Array.isArray(before) && !Array.isArray(after) && !Array.isArray(confirmed)
      && typeof before === 'object' && typeof after === 'object' && typeof confirmed === 'object') {
      const result = { ...confirmed };
      for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (field === '_cloudRevision' || same(before[field], after[field])) continue;
        if (!(field in after)) delete result[field];
        else result[field] = apply(before[field], after[field], confirmed[field], field);
      }
      return same(result, confirmed) ? confirmed : result;
    }
    return after;
  }
  return apply(previous, intended, authoritative);
}

/** Injectable client lets the same adapter be exercised without production credentials. */
export function createCloudAdapter(client) {
  async function allRows(table, order) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      let query = client.from(table).select('*');
      for (const field of [].concat(order)) query = query.order(field);
      const page = checked(await query.range(from, from + 999)) || [];
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }
  async function loadCloudData(baseFactory, profile) {
    if (!profile?.id) throw new Error('Inicia sesión para cargar los datos compartidos.');
    const base = typeof baseFactory === 'function' ? baseFactory() : structuredClone(baseFactory);
    const empty = Object.fromEntries(Object.entries(base).map(([name, value]) => [name, Array.isArray(value) ? (['rooms', 'protocols'].includes(name) ? value : []) : value]));
    const [orders, records] = await Promise.all([allRows('orders', ['created_at', 'id']), allRows('module_records', ['module', 'id'])]);
    empty.orders = orders.map(orderFromRow).reverse();
    const grouped = new Map();
    for (const row of records) {
      if (row.module === '__settings') { empty[row.id] = row.payload.value; continue; }
      if (!grouped.has(row.module)) grouped.set(row.module, []);
      grouped.get(row.module).push(moduleFromRow(row));
    }
    for (const [name, rows] of grouped) empty[name] = rows;
    return empty;
  }
  async function syncCloudData(previous, next, profile) {
    if (!profile?.id) throw new Error('La sesión ha finalizado. Inicia sesión de nuevo.');
    if (!previous) throw new Error('Carga el estado del servidor antes de guardar cambios.');
    const oldOrders = new Map((previous.orders || []).map((row) => [row.id, row]));
    const nextOrders = new Map((next.orders || []).map((row) => [row.id, row]));
    if ([...oldOrders.keys()].some((id) => !nextOrders.has(id))) throw new Error('Las solicitudes conservan su historial y no se pueden eliminar.');
    for (const order of next.orders || []) {
      const before = oldOrders.get(order.id);
      if (same(before, order)) continue;
      if (!before || manager(profile)) {
        checked(await client.rpc('save_order', { p_payload: { ...clean(order), _cloudRevision: before?._cloudRevision ?? null } }));
      } else if (profile.role === 'technician') {
        const allowed = new Set(['reports', 'updates', 'status', 'progress', 'startedAt', 'closedAt']);
        if (Object.keys({ ...before, ...order }).some((name) => !allowed.has(name) && !same(before[name], order[name]))) throw new Error('Solo coordinación puede editar o reasignar una solicitud.');
      } else if (profile.role === 'requester') {
        if (order.createdBy !== profile.id || Object.keys({ ...before, ...order }).some((name) => name !== 'findings' && !same(before[name], order[name]))) throw new Error('Solo puedes adjuntar hallazgos a tus propias solicitudes.');
        checked(await client.rpc('save_order', { p_payload: { ...clean(order), _cloudRevision: before._cloudRevision ?? null } }));
      } else {
        throw new Error('La edición corresponde a ingeniería.');
      }
      const existing = new Set((before?.reports || []).map((report) => report.id));
      for (const report of order.reports || []) {
        if (!existing.has(report.id)) checked(await client.rpc('submit_work_report', { p_order_id: order.id, p_report: report }));
      }
    }
    const modules = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const module of modules) {
      if (['orders', 'schemaVersion', 'createdAt'].includes(module) || same(previous[module], next[module])) continue;
      if (!manager(profile) && !(profile.role === 'technician' && module === 'protocolRuns')) throw new Error('Este módulo requiere una cuenta de coordinación o administración.');
      if (Array.isArray(next[module])) {
        const old = new Map((previous[module] || []).map((row) => [rowId(row), row]));
        const current = new Map(next[module].map((row) => [rowId(row), row]));
        if (current.has('') || current.size !== next[module].length) throw new Error(`Hay registros sin identificador único en ${module}.`);
        for (const [id, row] of current) {
          if (!same(old.get(id), row)) checked(await client.rpc('save_module_record', { p_module: module, p_id: id, p_payload: { ...clean(row), _cloudRevision: old.get(id)?._cloudRevision ?? null } }));
        }
        for (const [id, row] of old) if (!current.has(id)) checked(await client.rpc('delete_module_record', { p_module: module, p_id: id, p_revision: row._cloudRevision ?? null }));
      } else {
        checked(await client.rpc('save_module_record', { p_module: '__settings', p_id: module, p_payload: { value: next[module] } }));
      }
    }
    return loadCloudData(() => next, profile);
  }
  async function importLocalData(local, profile, baseFactory) {
    if (!manager(profile)) throw new Error('La importación requiere coordinación o administración.');
    const current = await loadCloudData(baseFactory || (() => local), profile);
    const merged = { ...current };
    for (const [name, rows] of Object.entries(local)) {
      if (!Array.isArray(rows)) continue;
      // A blank room registry is a UI template, not a persisted server record.
      const retained = (current[name] || []).filter((row) => name !== 'rooms' || row._cloudRevision != null);
      const existing = new Set(retained.map(rowId));
      merged[name] = [...retained, ...rows.filter((row) => !existing.has(rowId(row))).map((row) => ({ ...row, _cloudRevision: undefined }))];
    }
    // Explicit migration includes room templates even when equal to the UI baseline.
    const before = { ...current, rooms: (current.rooms || []).filter((row) => row._cloudRevision) };
    return syncCloudData(before, merged, profile);
  }
  return { loadCloudData, syncCloudData, importLocalData };
}

const adapter = supabase ? createCloudAdapter(supabase) : null;
const requireAdapter = () => { if (!adapter) throw new Error('La base de datos compartida todavía no está configurada.'); return adapter; };
export const loadCloudData = (...args) => requireAdapter().loadCloudData(...args);
export const syncCloudData = (...args) => requireAdapter().syncCloudData(...args);
export const importLocalData = (...args) => requireAdapter().importLocalData(...args);
