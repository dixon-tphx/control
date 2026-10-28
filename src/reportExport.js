// Report charts are rendered locally so exported files contain the image itself.
// This code does not call chart rendering services or fetch external resources.
export function chartPNG(title, rows, series) {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 640;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1200, 640);
  ctx.fillStyle = '#101820'; ctx.font = 'bold 27px Arial'; ctx.fillText(title.slice(0, 75), 38, 48);
  const colors = ['#101820', '#00a19a', '#dfb56c', '#71829c'];
  series.forEach((entry, index) => { ctx.fillStyle = colors[index % colors.length]; ctx.fillRect(40 + index * 290, 77, 14, 14); ctx.fillStyle = '#435064'; ctx.font = '18px Arial'; ctx.fillText(entry.label || entry.key, 62 + index * 290, 90); });
  const chartRows = rows.length ? rows : [{ name: 'Sin registros', ...Object.fromEntries(series.map((entry) => [entry.key, 0])) }];
  const max = Math.max(1, ...chartRows.flatMap((row) => series.map((entry) => Number(row[entry.key]) || 0)));
  const left = 230, width = 870, top = 125, height = 450, group = height / chartRows.length;
  ctx.strokeStyle = '#e5e9ee'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const x = left + width * i / 4; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + height); ctx.stroke(); ctx.fillStyle = '#637083'; ctx.font = '16px Arial'; ctx.fillText((max * i / 4).toFixed(max < 5 ? 1 : 0), x - 5, 605); }
  chartRows.forEach((row, index) => {
    const y = top + index * group;
    ctx.fillStyle = '#435064'; ctx.font = '18px Arial'; ctx.fillText(String(row.name).slice(0, 22), 35, y + group / 2 + 5);
    const barHeight = Math.min(25, (group - 15) / Math.max(1, series.length));
    series.forEach((entry, seriesIndex) => { const value = Number(row[entry.key]) || 0; const barY = y + (group - barHeight * series.length) / 2 + seriesIndex * barHeight; ctx.fillStyle = colors[seriesIndex % colors.length]; ctx.fillRect(left, barY, width * value / max, Math.max(3, barHeight - 4)); ctx.fillStyle = '#435064'; ctx.font = '16px Arial'; ctx.fillText(String(Math.round(value * 100) / 100), Math.min(1145, left + width * value / max + 8), barY + Math.max(14, barHeight - 7)); });
  });
  return canvas.toDataURL('image/png');
}

function imageData(url) {
  if (!/^data:image\/(png|jpeg|jpg);base64,/i.test(url || '')) return null;
  const encoded = url.split(',')[1];
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return { bytes, type: /^data:image\/png/i.test(url) ? 'png' : 'jpg' };
}
async function imageSize(url, maxWidth = 610, maxHeight = 400) {
  const image = await new Promise((resolve, reject) => { const item = new Image(); item.onload = () => resolve(item); item.onerror = reject; item.src = url; });
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return { width: Math.round(image.width * scale), height: Math.round(image.height * scale) };
}

export async function downloadReportWord({ title, subtitle, summary, definitions, metrics, charts, sections, tables, photos, author }) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } = await import('docx');
  const paragraph = (text, bold = false) => new Paragraph({ children: [new TextRun({ text: String(text || ''), bold, size: 21 })], spacing: { after: 120 } });
  const heading = (text, level = HeadingLevel.HEADING_2) => new Paragraph({ text, heading: level, spacing: { before: 240, after: 150 } });
  const children = [heading(title, HeadingLevel.TITLE), paragraph(subtitle), paragraph(`Preparado por: ${author || 'Ingeniería'}`), heading('Resumen ejecutivo')];
  for (const line of String(summary || 'Sin resumen redactado.').split('\n')) children.push(paragraph(line));
  children.push(heading('Indicadores del período'));
  for (const metric of metrics) children.push(paragraph(`${metric.label}: ${metric.value}`, true));
  children.push(heading('Criterios y alcance de las mediciones'));
  for (const line of definitions) children.push(paragraph(line));
  for (const chart of charts) {
    children.push(heading(chart.name));
    const data = imageData(chart.url);
    if (data) children.push(new Paragraph({ children: [new ImageRun({ data: data.bytes, type: data.type, transformation: await imageSize(chart.url, 610, 360) })], alignment: AlignmentType.CENTER }));
  }
  for (const section of sections) { children.push(heading(section.title)); if (!section.rows.length) children.push(paragraph('Sin movimientos fechados en el período.')); for (const row of section.rows) children.push(paragraph(row)); }
  for (const table of tables) {
    children.push(heading(table.name));
    const rows = table.rows || [];
    const headers = table.headers || (rows[0] ? Object.keys(rows[0]).slice(0, 5) : []);
    if (!rows.length) { children.push(paragraph('Sin registros para el período.')); continue; }
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      new TableRow({ tableHeader: true, children: headers.map((key) => new TableCell({ children: [paragraph(key, true)], shading: { fill: 'EAF0F4' } })) }),
      ...rows.map((row) => new TableRow({ children: headers.map((key) => new TableCell({ children: [paragraph(row[key] ?? '')] })) })),
    ] }));
  }
  children.push(heading('Evidencia fotográfica del período'));
  if (!photos.length) children.push(paragraph('No hay fotografías fechadas dentro del período seleccionado.'));
  for (const photo of photos) {
    const data = imageData(photo.url); if (!data) continue;
    children.push(heading(photo.section || 'Evidencia', HeadingLevel.HEADING_3), paragraph(photo.name));
    children.push(new Paragraph({ children: [new ImageRun({ data: data.bytes, type: data.type, transformation: await imageSize(photo.url) })], alignment: AlignmentType.CENTER }));
  }
  const doc = new Document({ creator: 'SIGMA', title, description: subtitle, sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 800, right: 800 } } }, children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `${title.replace(/[^\p{L}\p{N}-]+/gu, '-').toLowerCase()}.docx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
