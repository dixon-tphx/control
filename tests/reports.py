"""Validate production-bundle report downloads with embedded graphs and evidence."""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:4173')
with sync_playwright() as p, TemporaryDirectory() as folder:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    page = browser.new_page(accept_downloads=True, viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.get_by_label('Correo electrónico', exact=True).fill('admin@sigma.local')
    page.get_by_label('Contraseña', exact=True).fill('SigmaAdmin#2026')
    page.get_by_role('button', name='Iniciar sesión', exact=True).click()
    page.get_by_role('heading', name='Todo bajo control.').wait_for()
    page.get_by_role('button', name='Ayuda y datos de la demostración').click()
    with page.expect_download() as info:
        page.get_by_role('button', name='Copia con fotos', exact=True).click()
    info.value.save_as(Path(folder) / 'fixture.json')
    data = json.loads((Path(folder) / 'fixture.json').read_text())
    photo = page.evaluate("""()=>{let c=document.createElement('canvas');c.width=60;c.height=40;let x=c.getContext('2d');x.fillStyle='#1976ff';x.fillRect(0,0,60,40);return {id:'TEST-PHOTO',name:'Evidencia de prueba',url:c.toDataURL('image/png')}}""")
    preventive_photo = page.evaluate("""()=>{let c=document.createElement('canvas');c.width=60;c.height=40;let x=c.getContext('2d');x.fillStyle='#ffad33';x.fillRect(0,0,60,40);return {id:'PREVENTIVE-PHOTO',name:'Evidencia preventiva',url:c.toDataURL('image/png')}}""")
    now = datetime.now(timezone.utc).isoformat()
    data['orders'][0]['reports'] = [{'id': 'REPORT-TEST', 'at': now, 'authorId': 'demo-tech-ana', 'authorName': 'Ana', 'authorRole': 'technician', 'notes': 'Verificación funcional de prueba', 'status': 'progress', 'progress': 70, 'photos': [photo]}]
    data['preventiveRuns'] = [{'id': 'PREV-TEST', 'date': now, 'planId': data['preventivePlans'][0]['id'], 'planTitle': 'Prueba con evidencia', 'equipment': 'Gas', 'area': 'Electromecánica', 'building': 'Edificio A', 'checks': [], 'authorName': 'Carlos', 'photos': [preventive_photo]}]
    page.evaluate("""async(value)=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('control-engineering-demo',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const t=db.transaction('snapshots','readwrite');t.objectStore('snapshots').put(value,'current');t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}""", data)
    page.reload()
    page.get_by_role('heading', name='Todo bajo control.').wait_for()
    results = []
    for label, button, prefix, ext in [('Informe semanal', 'Word con fotos', 'word/media/', 'docx'), ('Informe semanal', 'Excel con fotos', 'xl/media/', 'xlsx'), ('Ejecutivo mensual', 'Excel con fotos', 'xl/media/', 'xlsx')]:
        page.locator('nav').get_by_role('button', name=label, exact=True).click()
        with page.expect_download() as info:
            page.get_by_role('button', name=button, exact=True).click()
        output = Path(folder) / (label + '.' + ext)
        info.value.save_as(output)
        with ZipFile(output) as file:
            media = [name for name in file.namelist() if name.startswith(prefix) and not name.endswith('/')]
            assert len(media) >= 5, (label, ext, media)
            assert all(file.read(name).startswith(b'\x89PNG') for name in media)
        results.append({'report': label, 'format': ext, 'embedded_media': len(media)})
    assert not errors, errors
    print(json.dumps({'passed': results, 'js_errors': errors}, ensure_ascii=False, indent=2))
    browser.close()
