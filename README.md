# Control · Ingeniería hotelera

Primera versión interactiva para presentar el flujo de un departamento de ingeniería hotelera. Interfaz en español, adaptable a móvil, con datos ficticios claramente identificados.

## Ejecutar

Node.js 22.12 o posterior; validado con Node.js 24.19 y npm 11.9.

```bash
cd /workspace/control
npm ci --cache /tmp/control-npm-cache
npm run dev -- --port 5173
```

Para validar el paquete de producción:

```bash
npm run build
npm run preview -- --port 4173
```

## Módulos

- **Resumen:** indicadores y gráficos de operación, alertas y habitaciones revisadas.
- **Solicitudes:** equipo asignado por área, prioridad alta/media/baja, carpeta de avance, horas previstas, tiempos de resolución y cierre. La cuarta repetición del mismo síntoma en el mismo edificio y habitación/ubicación genera una advertencia; los reportes de ubicaciones diferentes no se mezclan.
- **Preventivo:** programa por edificio con listas editables para gas, aire acondicionado, cámaras de refrigeración, cárcamo, hielo, piscinas, tableros, lavandería, sistemas críticos, infraestructura y pruebas semanales de supresión y generadores. Los hallazgos significativos crean trabajos correctivos vinculados.
- **Correctivo:** seguimiento de trabajos derivados de preventivos, habitaciones y recorridas.
- **Habitaciones 360:** 123 habitaciones provisionales 001–123, con número, edificio y m² editables. Checklist de 23 puntos derecha–izquierda, incluida la prueba de cierre de la puerta desde 45°, borradores, fotos e historial.
- **Energéticos:** enero–diciembre, electricidad (kWh), agua (m³), gas (kg), residuos segregados (kg), tarifas y costos. Factores por huésped-noche, habitación ocupada-noche, habitación disponible, platos y m². La alarma compara el consumo mensual con la media de los tres meses registrados anteriores; umbral inicial 20%, editable. Los meses sin registro y divisores cero no se muestran como consumo cero.
- **Recorridas:** ubicación, descripción, fotos, prioridad, informe imprimible y conversión a correctivo.
- **FF&E / CAPEX:** proyección anual de mejoras por área, edificio, prioridad y etapa.
- **Presupuesto:** límites mensuales, cuentas, solicitudes, órdenes de compra, cargos fijos, repuestos y reparaciones. Separa pagos al corte, obligaciones pendientes y solicitudes estimadas para evitar duplicar importes. Es un control departamental, no un libro mayor de partida doble.
- **Excel:** archivos `.xlsx` reales por módulo y exportación general. Las imágenes no se incrustan en Excel; el respaldo JSON sí las incluye.

## Datos y conservación

Los registros se guardan localmente en **IndexedDB** del navegador. No hay servidor, autenticación ni sincronización entre usuarios o dispositivos. El historial no tiene un borrado automático ni un límite de cantidad impuesto por la aplicación, pero depende de la cuota del navegador y puede perderse si se borra el almacenamiento del sitio.

Esto **no garantiza conservación por uno o dos años**. Para producción se necesita una base de datos central, almacenamiento privado de fotos, autenticación, permisos por área, auditoría y respaldos con política de retención definida. No usar esta demo como único archivo operativo. Las fotografías se comprimen a JPEG de hasta 1280 px y se pueden descargar junto con el resto de los datos mediante el respaldo.

Los edificios, responsables y cuentas son ejemplos. Moneda de demostración: USD; cambiar su etiqueta no convierte importes. La clasificación de residuos orgánicos deberá adaptarse al tratamiento real del hotel. Los checklists son plantillas que deben ajustarse a equipos, fabricante y procedimientos del hotel.

## Despliegue en Vercel

El proyecto contiene `vercel.json` con framework **Vite**, instalación `npm ci`, compilación `npm run build` y salida **dist**. No requiere variables para ejecutar la demo.

Para publicar desde este entorno es necesario un acceso Vercel válido al equipo `dixon13` y conectividad a `api.vercel.com`; `*.vercel.app` permite verificar el despliegue. Los requisitos se han guardado en el borrador del entorno. El token se introduce únicamente en los secretos del entorno, nunca en el repositorio o en chat.

Se puede importar el repositorio desde el panel de Vercel. La sesión del navegador del usuario y los enlaces `vercel.com/new` no autentican automáticamente esta máquina. Publicar la configuración del entorno de Codex y desplegar la aplicación en Vercel son operaciones distintas.

## Validación

El entorno dispone de Chromium y Python Playwright para comprobar funcionalmente los módulos. La compilación genera una aplicación estática; Excel se carga de forma diferida al exportar.
