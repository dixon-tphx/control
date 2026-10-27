"""Functional checks against a running build; requires Playwright and Chromium.

TEST_BASE_URL=http://127.0.0.1:4173 python tests/smoke.py
"""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:4173')
NAV = ['Resumen', 'Solicitudes de trabajo', 'Mantenimiento preventivo',
       'Plan correctivo', 'Habitaciones 360', 'Energéticos', 'Recorridas',
       'FF&E / CAPEX', 'Presupuesto']


def main():
    checks = []
    with sync_playwright() as p, TemporaryDirectory() as output:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        page.get_by_role('heading', name='Todo bajo control.').wait_for()
        page.locator('.dashboard-chart .recharts-surface').wait_for()
        checks.append('Overview and charts render')

        def nav(name):
            if page.get_by_role('button', name='Abrir menú', exact=True).is_visible():
                page.get_by_role('button', name='Abrir menú', exact=True).click()
            page.locator('nav').get_by_role('button', name=name, exact=False).click()

        for name in NAV:
            nav(name)
            page.get_by_role('heading', level=1).wait_for(state='attached')
            assert page.locator('main').inner_text().strip(), name
        checks.append('All nine modules render')

        nav('Mantenimiento preventivo')
        page.get_by_role('button', name='Nuevo plan', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Nombre del plan', exact=True).fill('Prueba funcional de infraestructura')
        dialog.get_by_label('Equipo o sistema', exact=True).select_option(label='Infraestructura del edificio')
        dialog.get_by_label('Puntos del checklist · uno por línea', exact=True).fill('Revisar muro norte\nRevisar puerta de acceso')
        dialog.get_by_role('button', name='Guardar plan', exact=True).click()
        # The newly created plan is appended; select its unique equipment row.
        row = page.locator('tbody tr').filter(has_text='Infraestructura del edificio').last
        row.get_by_role('button', name='Revisar', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Resultado 1', exact=True).select_option('finding')
        dialog.get_by_label('Descripción del hallazgo', exact=True).fill('Fisura significativa en muro norte, requiere evaluación.')
        dialog.get_by_role('checkbox').check()
        dialog.get_by_label('Prioridad del correctivo', exact=True).select_option('high')
        dialog.get_by_label('Resultado 2', exact=True).select_option('ok')
        dialog.get_by_role('button', name='Guardar revisión', exact=True).click()
        page.get_by_text('trabajo(s) correctivo(s) creado(s)', exact=False).wait_for()
        checks.append('Preventive checklist generates significant linked corrective')

        nav('Plan correctivo')
        page.get_by_role('textbox', name='Buscar trabajos', exact=False).fill('Revisar muro norte')
        assert 'Revisar muro norte' in page.locator('tbody').inner_text()
        checks.append('Corrective receives preventive finding')

        nav('Habitaciones 360')
        assert page.locator('.room-tile').count() == 123
        checks.append('Exactly 123 rooms')

        # Export real XLSX, not a renamed CSV. Each module also has its own export.
        page.get_by_role('button', name='Ayuda y datos de la demostración').click()
        with page.expect_download() as download_info:
            page.get_by_role('button', name='Exportar todo a Excel').click()
        download = download_info.value
        target = Path(output) / download.suggested_filename
        download.save_as(target)
        with ZipFile(target) as workbook:
            assert 'xl/workbook.xml' in workbook.namelist()
            xml = workbook.read('xl/workbook.xml').decode()
            assert xml.count('<sheet ') == 10
            assert 'Historial preventivo' in xml
        page.get_by_role('button', name='Cerrar ventana', exact=True).click()
        checks.append('General Excel workbook has ten worksheets')

        for width in [360, 390, 768, 1440]:
            page.set_viewport_size({'width': width, 'height': 900})
            for name in NAV:
                nav(name)
                page.wait_for_timeout(80)
                dimensions = page.evaluate('({width:innerWidth,body:document.body.scrollWidth,html:document.documentElement.scrollWidth})')
                assert dimensions['body'] <= width and dimensions['html'] <= width, (name, dimensions)
        checks.append('All nine modules fit 360/390/768/1440px viewports')
        page.reload()
        page.get_by_role('heading', name='Todo bajo control.').wait_for()
        nav('Mantenimiento preventivo')
        page.get_by_role('button', name='Historial (1)', exact=True).click()
        assert 'Infraestructura del edificio' in page.locator('tbody').inner_text()
        checks.append('Saved inspection survives reload')
        assert not errors, errors
        checks.append('No uncaught JavaScript errors')
        context.close()
        browser.close()
    print(json.dumps({'passed': len(checks), 'checks': checks}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
