// Shared identity rules for work orders and inspection findings.
export const normalizeText = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');
export const canonicalRoom = (value = '') => /^h?\d{1,3}$/i.test(String(value)) ? `H${String(value).replace(/^h/i, '').padStart(3, '0')}` : String(value);
export function faultIdentity(order) {
  const symptom = normalizeText(order.faultDetail || order.fault);
  const site = order.roomId ? `room:${canonicalRoom(order.roomId)}` : normalizeText(order.location);
  if (!symptom || !site || !order.building) return null;
  return [normalizeText(order.building), site, symptom].join('|');
}
export function findOpenDuplicate(orders, candidate) {
  const key = faultIdentity(candidate);
  return key ? orders.find((order) => order.id !== candidate.id && order.status !== 'completed' && faultIdentity(order) === key) || null : null;
}
export const managerRole = (user) => !user || ['admin', 'coordinator'].includes(user.role);
export const canReportOrder = (user, order) => managerRole(user) || (user.role === 'technician' && user.memberId === order.owner);
export function dateInRange(value, from, to) {
  if (!value) return false;
  const day = String(value).slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}
