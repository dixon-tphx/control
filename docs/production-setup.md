# Cuentas reales y datos compartidos (opcional)

La aplicación funciona actualmente como demostración local: los datos están en IndexedDB y el perfil de demostración se conserva en la sesión del navegador. Las cuentas locales de correo/contraseña son públicas y sirven para probar pantallas; no constituyen autenticación ni protegen información. No hay sincronización entre dispositivos. El código admite además Supabase, pero esa conexión no queda activada por desplegar el frontend.

## Activar Supabase

1. Crea un proyecto de Supabase y ejecuta el archivo completo `supabase/schema.sql` en su SQL Editor. Hazlo en una base nueva; no sustituye una migración revisada de una base existente.
2. En Authentication configura la URL pública del frontend como Site URL y como URL permitida de redirección. Mantén la confirmación del correo y configura el proveedor de correo para uso real. Configura una longitud mínima de contraseña de diez caracteres o más.
3. En Vercel, configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con la URL del proyecto y su clave pública `anon`/publishable. Esas claves identifican el proyecto; la autorización la aplican RLS y los RPCs. Nunca uses una clave `service_role` ni una clave secreta en una variable `VITE_*`, el repositorio, el navegador o este documento.
4. Vuelve a desplegar el frontend para incorporar las variables de Vite. Con ambas variables presentes se muestra el acceso real por correo y contraseña. Con una sola variable se informa de conexión incompleta; una conexión fallida no activa perfiles de demostración.
5. Crea y confirma la primera cuenta desde la aplicación. Siempre comienza como solicitante, incluso si alguien falsifica metadatos de registro. Promueve la cuenta administrativa únicamente en el SQL Editor, con una dirección que tú controles:

```sql
-- Sustituye el marcador por la cuenta ya creada. No contiene una contraseña.
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'ADMIN_EMAIL_AQUI');
```

6. Las cuentas técnicas y de coordinación también deben registrarse y confirmar su correo. Desde el SQL Editor asigna sus roles y, para técnicos, vincula el identificador del integrante correspondiente:

```sql
update public.profiles
set role = 'technician', member_id = 'ana', area = 'Infraestructura'
where id = (select id from auth.users where email = 'TECNICO_EMAIL_AQUI');

update public.profiles
set role = 'coordinator', member_id = null, area = ''
where id = (select id from auth.users where email = 'COORDINACION_EMAIL_AQUI');
```

El RPC `admin_set_profile(p_user_id, p_role, p_member_id)` permite administrar estas asignaciones desde un cliente autenticado como administrador. La interfaz actual no incluye un administrador de cuentas. Cada integrante técnico se puede vincular a una sola cuenta. Los nombres, áreas e identificadores de `team_members` son inicialmente ejemplos y deben corresponder a `TEAM` antes de trabajar con personal real. Las 123 habitaciones son una plantilla sin inspecciones finalizadas, no un inventario verificado del hotel.

## Permisos efectivos en la base

| Perfil | Consultas | Escrituras |
| --- | --- | --- |
| Solicitante | Sus propias solicitudes y sus partes de trabajo | Crear solicitud pendiente sin responsable; añadir hallazgos a una solicitud propia |
| Técnico | Solicitudes asignadas a su `member_id`, sus partes, plantillas de protocolos y ejecuciones propias | Añadir partes de ejecución a sus asignaciones y continuar ejecuciones propias abiertas; los registros cerrados son inmutables |
| Coordinación | Solicitudes, perfiles y módulos de operación | Asignar y editar trabajos; registrar partes; gestionar módulos |
| Administración | Igual que coordinación | Además, asignar roles y vinculaciones técnicas |

Las tablas no conceden INSERT, UPDATE ni DELETE a clientes anónimos o autenticados. Las funciones de escritura comprueban la sesión y el rol en el servidor, sin confiar en el perfil recibido del navegador. Los solicitantes no pueden hacerse administradores; los técnicos no pueden reasignar trabajos ni escribir contabilidad. Los autores y fechas de los partes y hallazgos se fijan en el servidor, y los historiales previos se conservan. Las solicitudes y los partes no se borran desde la aplicación. Las plantillas de protocolos y sus instrucciones son legibles por usuarios autenticados; sus ejecuciones técnicas se atribuyen en el servidor y solo las lee su autor o coordinación. El técnico puede guardar avances de una ejecución propia abierta; al cerrarla queda inmutable y conserva la bitácora del servidor.

Cada solicitud y cada entrada de un módulo es un registro independiente. Los cambios con revisión cargada comprueban conflictos para evitar sobrescribir ediciones simultáneas del mismo registro. Un guardado que afecta a varios registros no es una transacción global: si falla, vuelve a cargar el servidor para comprobar qué operaciones se confirmaron. Los partes tienen un identificador único y se pueden reintentar sin duplicarlos. No se envía un JSON que sustituya toda la base.

## Conservar los datos locales

Descarga el respaldo JSON con fotos antes de cambiar de modo. Activar Supabase no borra IndexedDB y tampoco importa automáticamente sus ejemplos o su información. Un administrador o coordinador puede usar `importLocalData(localBackup, profile, baseFactory)` para fusionar registros por identificador. Ante un identificador ya existente prevalece el servidor; revisa previamente las habitaciones, porque su plantilla local puede requerir una migración deliberada. Valida la importación con una copia antes de usar datos reales. El historial importado no sirve como evidencia de identidad: los nuevos partes se atribuyen a quien ejecuta la importación.

## Fotografías y conservación

En esta versión, los adjuntos son imágenes optimizadas `data:` dentro de los registros protegidos por RLS. Un respaldo JSON incluye esas imágenes. Esto permite una primera conexión sin un bucket público, pero incrementa el tamaño de las filas y no reemplaza un plan de archivo.

Para conservación de uno o dos años configura copias de seguridad y restauración verificadas en Supabase, límites y presupuesto de almacenamiento, y una política de retención aprobada. Para más volumen, migra los adjuntos a un bucket privado y entrega URLs firmadas temporales según el permiso de la solicitud. Nunca conviertas un bucket en público para resolver un problema de permisos. Revisa de forma periódica que una restauración de prueba recupere datos e imágenes; no se garantiza conservación solo por mantener un despliegue de Vercel.

## Verificación antes de uso real

En un proyecto de prueba, crea dos solicitantes, dos técnicos con distintas vinculaciones y una cuenta de coordinación. Confirma que cada solicitante solo lee sus casos; que su creación ignora responsable, estado o progreso falsificados; que un técnico no lee ni reporta trabajos de otro; que editar su rol, una asignación o contabilidad por REST falla; que el servidor atribuye el parte al usuario real; y que coordinación ve su ejecución. Repite las consultas con una clave pública sin sesión: no debe haber acceso a filas. Prueba un conflicto entre dos navegadores y conserva un respaldo antes de una importación.

Las pruebas locales del adaptador y de las políticas SQL no verifican la conexión con una instancia real. El acceso, correo, RLS en el proyecto elegido, restauración y conservación deben comprobarse allí después de configurar la conexión. No se necesita una contraseña de Google, Vercel o Supabase en el chat.
