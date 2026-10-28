import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { X, Camera, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';

export const AREAS = ['Infraestructura', 'Electromecánica', 'Habitaciones', 'Servicios generales'];
export const BUILDINGS = ['Edificio A', 'Edificio B', 'Edificio C', 'Áreas comunes'];
export const TEAM = [
  { id: 'ana', name: 'Ana Rodríguez', area: 'Infraestructura' },
  { id: 'carlos', name: 'Carlos Méndez', area: 'Electromecánica' },
  { id: 'sofia', name: 'Sofía Vargas', area: 'Habitaciones' },
  { id: 'diego', name: 'Diego Castro', area: 'Servicios generales' },
  { id: 'luis', name: 'Luis Jiménez', area: 'Electromecánica' },
  { id: 'maria', name: 'María Solano', area: 'Infraestructura' },
];

export const uid = (prefix = 'REG') => `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
export function todayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Costa_Rica' }).format(date);
}
export const money = (amount, currency = 'USD') => new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount) || 0);

export function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{Children.map(children, (child) => isValidElement(child) && ['input', 'select', 'textarea'].includes(child.type) && !child.props['aria-label'] ? cloneElement(child, { 'aria-label': label }) : child)}</label>;
}

export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const targets = () => [...ref.current.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter((element) => !element.disabled && element.getClientRects().length);
    (ref.current.querySelector('input:not([type="file"])') || targets()[0])?.focus();
    const handler = (event) => {
      if (event.key === 'Escape') close.current();
      if (event.key === 'Tab') {
        const items = targets();
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handler); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="module-dialog-title" ref={ref}><div className="modal-header"><h2 id="module-dialog-title">{title}</h2><button className="icon-button" aria-label="Cerrar ventana" onClick={onClose}><X size={20} /></button></div><div className="modal-body">{children}</div></section></div>;
}

export async function exportWorkbook(filename, sheets) {
  const imported = await import('exceljs');
  const ExcelJS = imported.default || imported;
  const book = new ExcelJS.Workbook();
  book.creator = 'SIGMA · Sistema Integral de Gestión de Ingeniería';
  book.created = new Date();
  for (const item of sheets) {
    const sheet = book.addWorksheet(item.name.replace(/[\\/*?:\[\]]/g, '').slice(0, 31) || 'Datos');
    const rows = item.rows || [];
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    if (!headers.length) sheet.addRow(['Sin registros']);
    else sheet.columns = headers.map((header) => ({ header, key: header, width: Math.min(48, Math.max(16, header.length + 4)) }));
    for (const row of rows) sheet.addRow(Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value && typeof value === 'object' ? JSON.stringify(value) : value ?? ''])));
    sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF101820' } }; });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    if (headers.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: headers.length } };
    // Embedded evidence survives downloading and moving the workbook.
    let photoRow = Math.max(3, rows.length + 4);
    for (const photo of item.images || []) {
      const source = photo.url || photo.dataUrl;
      if (!source || !/^data:image\/(png|jpeg|jpg);base64,/i.test(source)) continue;
      const extension = /^data:image\/png/i.test(source) ? 'png' : 'jpeg';
      const imageId = book.addImage({ base64: source, extension });
      const row = photo.row ?? photoRow;
      if (photo.name) sheet.getCell(Math.floor(row), 1).value = String(photo.name);
      sheet.addImage(imageId, { tl: { col: photo.column ?? 0, row }, ext: { width: photo.width || 440, height: photo.height || 300 }, editAs: 'oneCell' });
      photoRow = row + 19;
    }
  }
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = `${filename.replace(/\.xlsx$/i, '').replace(/^control[-_]/i, 'sigma-ing-')}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readPhotos(files) {
  const list = Array.from(files);
  if (list.length > 10) throw new Error('Selecciona como máximo 10 fotos a la vez.');
  return Promise.all(list.map(async (file) => {
    if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type)) throw new Error('Usa imágenes JPG, PNG o WebP.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Cada fotografía debe pesar menos de 20 MB.');
    const source = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('No se pudo leer la foto. Prueba en formato JPG o PNG.')); image.src = source; });
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return { id: uid('FOTO'), name: file.name, url: canvas.toDataURL('image/jpeg', 0.78) };
    } finally { URL.revokeObjectURL(source); }
  }));
}

export function PhotoInput({ photos = [], onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const upload = async (event) => {
    const files = event.target.files;
    if (!files?.length) return;
    setBusy(true); setError('');
    try { const added = await readPhotos(files); onChange([...photos, ...added]); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); event.target.value = ''; }
  };
  return <div className="photo-input"><div className="photo-actions"><label className={`button secondary small ${busy ? 'disabled' : ''}`}>{busy ? <LoaderCircle size={16} className="spinning" /> : <ImagePlus size={16} />}{busy ? 'Procesando…' : 'Subir fotos'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif" multiple onChange={upload} disabled={busy} /></label><label className={`button secondary small ${busy ? 'disabled' : ''}`}><Camera size={16} />Tomar foto<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={upload} disabled={busy} /></label></div><p className="muted photo-hint">Evidencia optimizada en JPEG para las carpetas de trabajo y los informes.</p>{error && <p className="field-error" role="alert">{error}</p>}<div className="photo-grid">{photos.map((photo) => <div className="photo-item" key={photo.id}><button className="photo-preview" type="button" onClick={() => setPreview(photo)} aria-label={`Ampliar ${photo.name}`}><img src={photo.url} alt={photo.name} /></button><button type="button" className="photo-remove" aria-label={`Quitar ${photo.name}`} onClick={() => onChange(photos.filter((entry) => entry.id !== photo.id))}><Trash2 size={14} /></button></div>)}</div>{preview && <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="Fotografía ampliada"><button type="button" className="icon-button" aria-label="Cerrar fotografía" onClick={() => setPreview(null)}><X /></button><img src={preview.url} alt={preview.name} /></div>}</div>;
}
