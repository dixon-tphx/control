# SIGMA · Sistema Integral de Gestión de Ingeniería

Interfaz negra y azul, marca SIGMA con ojo y gráfico, diseño adaptable a móvil. Proyecto Vite/React del departamento de ingeniería hotelera. Versión 0.2.0.

## Accesos de demostración

Con las variables de Supabase vacías, el acceso usa estas **cuentas públicas de prueba**:

| Perfil | Correo | Contraseña de prueba |
| --- | --- | --- |
| Administración | admin@sigma.local | SigmaAdmin#2026 |
| Usuario solicitante | usuario@sigma.local | SigmaUsuario#2026 |
| Técnico (Carlos, Electromecánica) | tecnico@sigma.local | SigmaTecnico#2026 |
| Coordinación | coordinacion@sigma.local | SigmaCoord#2026 |

Son identidades ficticias, no buzones de correo. El formulario valida correo/contraseña y adapta las pantallas al perfil, pero una comprobación en el navegador no protege información ni equivale a autenticación de producción. No usar estas contraseñas en cuentas reales. La sesión se guarda en sessionStorage; los registros y las fotos, en IndexedDB del mismo navegador. No hay sincronización entre dispositivos en este modo.

Al configurar Supabase, estas cuentas de demostración dejan de funcionar: se usan cuentas reales y permisos de servidor. Consulta [Configuración de producción](docs/production-setup.md). Nunca colocar una clave service_role en el frontend.

## Ejecutar y validar

Node.js 22.12 o posterior (validado con 24.19):

```bash
cd /workspace/control
npm ci --cache /tmp/control-npm-cache
npm run dev -- --port 5173
```

```bash
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
# En otra terminal; requiere Python Playwright y Chromium:
python tests/smoke.py
python tests/reports.py
```

`npm test` comprueba migración del estado anterior, cuentas de demostración, cálculos de energéticos, adaptador compartido y políticas SQL/RLS en PostgreSQL embebido. La prueba de navegador usa datos aislados, no altera el historial del navegador del usuario.

## Actualizar el proyecto existente en Vercel

Aplicación: https://control-sand.vercel.app/ · repositorio: https://github.com/dixon-tphx/control · rama de producción: `main`.

1. En Vercel abre **Dixon → control**. En **Settings → Git**, confirma que está conectado `dixon-tphx/control` y que la rama de producción es `main`.
2. Un push nuevo a `main` normalmente inicia el despliegue automáticamente. En **Deployments**, abre la entrada más reciente y comprueba que corresponde al último commit.
3. Si no se inicia, usa **Create Deployment** y selecciona `main` o el SHA más reciente. Si tu interfaz solo ofrece **Redeploy**, úsalo sobre el despliegue del commit nuevo; volver a desplegar un commit antiguo no incorpora cambios de Git.
4. Conserva framework **Vite**, raíz `./`, instalación `npm ci`, compilación `npm run build`, salida `dist`; están definidos en `vercel.json`.
5. No necesitas variables ambientales para esta entrega local. Mantén vacías las dos de Supabase si vas a usar los accesos de prueba.
6. Espera estado **Ready**, comprueba que sea **Production / Current** y abre **Visit**. Si quedó como Preview, utiliza **Promote to Production** sobre ese despliegue validado.
7. Abre el mismo dominio y recarga con **Ctrl+F5**. Comprueba el logo SIGMA, el login y las nuevas secciones. La dirección `/version.json` muestra la versión y el commit incorporado por Vercel.

Para datos locales usa siempre el dominio de producción: cada dominio de preview tiene su propio almacenamiento. Antes de cambiar de dominio o borrar datos del navegador, descarga una copia JSON con fotos desde la ayuda. Un despliegue web no constituye un respaldo de los registros que existen en el navegador.

## Módulos

- **Resumen:** trabajo por área, avance, alertas de reincidencia, preventivos pendientes y cobertura 360.
- **Solicitudes y correctivos:** solicitante crea necesidades; coordinación asigna responsables por área; el técnico reporta solo sus asignaciones. Reportes fechados y atribuidos, fotos, avance y carpeta histórica. Una avería ya abierta muestra una opción de vincular; las reincidencias cuentan avisos iniciales y hallazgos vinculados, no actualizaciones de avance ni la misma evidencia de origen dos veces.
- **Rendimiento del equipo:** carga, cierres, tiempos, área y tipo de trabajo. Los indicadores explican su cohorte y no atribuyen rendimiento a registros sin autor.
- **Preventivo:** programa por edificio, equipos solicitados, pruebas semanales, borradores, controles previos y restitución documentada. Hallazgos significativos crean o se vinculan a correctivos; no marcan el equipo como restituido si quedan hallazgos significativos pendientes.
- **Habitaciones 360:** 123 números provisionales editables, checklist de 29 puntos derecha–izquierda, puerta que debe cerrar desde 45°, fotos, borradores y revisiones históricas. Los borradores antiguos incorporan nuevos puntos sin perder respuestas; los casos cerrados conservan su checklist original.
- **Secuencias de servicio:** 13 plantillas para habitaciones ocupadas/desocupadas, incendio, sismo, tsunami, E-One, agua, planta de tratamiento, elevadores, respaldo eléctrico y trabajos críticos de nivel 1/2/3. Fuentes, versiones, contactos configurables, revisión y registro por pasos. Los borradores generan simulaciones; no sustituyen el plan aprobado del hotel ni instrucciones del proveedor.
- **Energéticos:** lecturas acumuladas diarias (consumo por diferencia), demanda en kW separada, agua, gas con unidades explícitas, cargas en litros y dos tanques iniciales de 3.750 L. Estimación por porcentaje, reinicios documentados, intervalos de varios días y consolidación mensual con confirmación. No convierte gas líquido, vapor y masa entre sí sin datos técnicos.
- **Residuos:** plástico, aluminio, vidrio, cartón, metales, orgánicos y no valorizables; grasas en kg y aceite usado en litros. Conteo de recipientes por capacidad o volumen directo, sin doble conteo ni suma de litros con kg.
- **Recorridas:** fotos, ubicación, descripción, prioridad, informe imprimible y vínculo a correctivos.
- **FF&E / CAPEX:** proyección de mejoras por año, edificio, área, prioridad y etapa.
- **Órdenes de compra:** solicitud, aprobación, orden, recepción, pago y cancelación; cuenta obligatoria, proveedor, historial y vínculo al trabajo. Una sola línea presupuestaria por compra; cancelar libera compromisos y conserva trazabilidad.
- **Presupuesto:** gastos por cuenta y mes, pagos al corte, compromisos, solicitudes estimadas y cargos fijos; no duplica compras y no es un libro mayor de partida doble.
- **Informes semanales y ejecutivos mensuales:** resumen redactable, eventos fechados, resultados por sección, preventivos, correctivos, rendimiento y evidencia. Descargas reales **Word y Excel con gráficos y fotografías incrustados**.

## Documentos utilizados

Se usaron los siete PDF aportados para diseñar checklists, secuencias e informes. Los archivos originales, teléfonos personales y registros históricos privados no se publican en el repositorio. Las pantallas identifican las fuentes; no presentan las cifras de esos informes como mediciones actuales del sistema.

El umbral del agua del «70 %» se dejó sin configurar porque el texto no aclara reserva restante frente a volumen consumido. El SOP eléctrico superpone 0–4 horas con una acción indicada para más de 3 horas; la plantilla marca esa revisión pendiente y no ejecuta cortes de carga. Las secuencias de emergencia requieren revisión y aprobación del hotel.

## Conservación

El nombre interno de IndexedDB se conserva para migrar la primera versión sin borrar solicitudes, fotos o historial. No se impone depuración automática de casos cerrados, pero el almacenamiento local depende de la cuota del navegador y puede borrarse. Garantizar uno o dos años exige base de datos compartida, política de retención y restauraciones de respaldo comprobadas. Desplegar el frontend no activa automáticamente esas garantías.

Los informes Word/Excel contienen las imágenes; la copia JSON conserva datos y fotos. Las fotos se optimizan a JPEG de hasta 1280 px. Los edificios, integrantes y cuentas iniciales son ejemplos configurables.
