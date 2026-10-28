-- Run once in the SQL editor of a new Supabase project. No service key belongs in the browser.
begin;
create table if not exists public.team_members (
  id text primary key, name text not null, area text not null
);
insert into public.team_members (id,name,area) values
  ('ana','Ana Rodríguez','Infraestructura'),('carlos','Carlos Méndez','Electromecánica'),
  ('sofia','Sofía Vargas','Habitaciones'),('diego','Diego Castro','Servicios generales'),
  ('luis','Luis Jiménez','Electromecánica'),('maria','María Solano','Infraestructura')
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  role text not null default 'requester' check (role in ('requester','technician','coordinator','admin')),
  member_id text unique references public.team_members(id), area text not null default '',
  created_at timestamptz not null default now(),
  check (role <> 'technician' or member_id is not null)
);
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id,name,role)
  values (new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'name'),120),''),'Solicitante'),'requester');
  return new;
end; $$;
revoke all on function public.handle_new_user() from public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid();
$$;
create or replace function public.current_member_id() returns text
language sql stable security definer set search_path = '' as $$
  select member_id from public.profiles where id = auth.uid();
$$;
revoke all on function public.current_app_role(), public.current_member_id() from public;
grant execute on function public.current_app_role(), public.current_member_id() to authenticated;

create table if not exists public.orders (
  id text primary key check (length(id) between 1 and 100),
  created_by uuid not null references public.profiles(id),
  assigned_member_id text references public.team_members(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists orders_creator on public.orders(created_by);
create index if not exists orders_assignment on public.orders(assigned_member_id);
create table if not exists public.work_reports (
  id text primary key check (length(id) between 1 and 100),
  order_id text not null references public.orders(id),
  author_id uuid not null references public.profiles(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists work_reports_order on public.work_reports(order_id);
create table if not exists public.module_records (
  module text not null, id text not null, payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1, updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(), primary key(module,id)
);

alter table public.profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.orders enable row level security;
alter table public.work_reports enable row level security;
alter table public.module_records enable row level security;
drop policy if exists profile_read on public.profiles;
create policy profile_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_app_role() in ('admin','coordinator'));
drop policy if exists team_read on public.team_members;
create policy team_read on public.team_members for select to authenticated using (true);
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (
  public.current_app_role() in ('admin','coordinator')
  or (public.current_app_role() = 'requester' and created_by = auth.uid())
  or (public.current_app_role() = 'technician' and assigned_member_id = public.current_member_id())
);
drop policy if exists reports_read on public.work_reports;
create policy reports_read on public.work_reports for select to authenticated using (
  exists (select 1 from public.orders where orders.id = work_reports.order_id)
);
drop policy if exists module_read on public.module_records;
create policy module_read on public.module_records for select to authenticated
  using (public.current_app_role() in ('admin','coordinator') or module='protocols'
    or (module='__settings' and id='protocolSettings')
    or (public.current_app_role()='technician' and module='protocolRuns' and payload->>'actorId'=auth.uid()::text));

-- REST clients can SELECT under RLS. All writes go through checked RPCs below.
revoke all on public.profiles,public.team_members,public.orders,public.work_reports,public.module_records from anon,authenticated;
grant select on public.profiles,public.team_members,public.orders,public.work_reports,public.module_records to authenticated;

create or replace function public.admin_set_profile(p_user_id uuid,p_role text,p_member_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_area text;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' then raise exception 'Administración requerida' using errcode='42501'; end if;
  if p_role not in ('requester','technician','coordinator','admin') then raise exception 'Rol inválido'; end if;
  if p_role = 'technician' and p_member_id is null then raise exception 'Vincula un integrante del equipo'; end if;
  select area into v_area from public.team_members where id = p_member_id;
  if p_member_id is not null and v_area is null then raise exception 'Integrante desconocido'; end if;
  update public.profiles set role=p_role,member_id=p_member_id,area=coalesce(v_area,'') where id=p_user_id;
  if not found then raise exception 'Cuenta desconocida'; end if;
end; $$;

create or replace function public.save_order(p_payload jsonb) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_app_role(); v_row public.orders; v_exists boolean;
  v_id text := p_payload->>'id'; v_now timestamptz := now(); v_payload jsonb;
  v_findings jsonb; v_finding jsonb; v_name text; v_progress numeric; v_status text;
begin
  if auth.uid() is null or v_role is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>16000000 then raise exception 'Solicitud inválida o demasiado grande'; end if;
  if v_id is null or length(v_id) not between 1 and 100 then raise exception 'Identificador inválido'; end if;
  select * into v_row from public.orders where id=v_id for update;
  v_exists := found;
  if v_role not in ('admin','coordinator','requester') then raise exception 'No puedes editar solicitudes; utiliza el parte de trabajo' using errcode='42501'; end if;
  if v_exists and p_payload ? '_cloudRevision' and (p_payload->>'_cloudRevision' is null or (p_payload->>'_cloudRevision')::bigint <> v_row.revision) then raise exception 'La solicitud cambió en otro dispositivo. Actualiza antes de guardar.' using errcode='40001'; end if;
  if v_exists and v_role='requester' then
    if v_row.created_by <> auth.uid() then raise exception 'Solicitud ajena' using errcode='42501'; end if;
    if (p_payload - array['findings','_cloudRevision','createdBy','createdAt']) is distinct from (v_row.payload - array['findings','_cloudRevision','createdBy','createdAt']) then
      raise exception 'Solo puedes adjuntar hallazgos a tu propia solicitud' using errcode='42501';
    end if;
    v_payload := v_row.payload;
  else
    if length(trim(coalesce(p_payload->>'title',''))) < 3 then raise exception 'Escribe un título de al menos tres caracteres'; end if;
    if coalesce(p_payload->>'roomId','')='' and length(trim(coalesce(p_payload->>'location',''))) < 1 then raise exception 'Indica la ubicación'; end if;
    v_payload := p_payload - array['_cloudRevision','reports','updates','findings','createdBy','createdAt'];
    if v_role='requester' then
      v_payload := v_payload || jsonb_build_object('owner','','status','pending','progress',0,'source','request','startedAt',null,'closedAt',null);
    end if;
    v_status := coalesce(v_payload->>'status','pending');
    if v_status not in ('pending','progress','completed') then raise exception 'Estado inválido'; end if;
    v_progress := coalesce((v_payload->>'progress')::numeric,0);
    if v_progress < 0 or v_progress > 100 then raise exception 'Avance inválido'; end if;
    if v_status='completed' then v_progress:=100; end if;
    select name into v_name from public.profiles where id=auth.uid();
    v_payload := v_payload || jsonb_build_object('id',v_id,'progress',v_progress,'status',v_status,
      'createdBy',case when v_exists then v_row.created_by else auth.uid() end,
      'createdByName',case when v_exists then v_row.payload->>'createdByName' else v_name end,
      'createdAt',case when v_exists then v_row.created_at else v_now end,
      'startedAt',case when v_status='pending' then coalesce(v_row.payload->'startedAt','null'::jsonb) else coalesce(nullif(v_row.payload->'startedAt','null'::jsonb),to_jsonb(v_now)) end,
      'closedAt',case when v_status='completed' then coalesce(nullif(v_row.payload->'closedAt','null'::jsonb),to_jsonb(v_now)) else 'null'::jsonb end,
      'reports',coalesce(v_row.payload->'reports','[]'::jsonb),
      'updates',coalesce(v_row.payload->'updates','[]'::jsonb) || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',v_now,'authorId',auth.uid(),'authorName',v_name,'authorRole',v_role,'progress',v_progress,'note',case when v_exists then 'Solicitud actualizada por coordinación' else 'Solicitud registrada' end)));
  end if;
  select name into v_name from public.profiles where id=auth.uid();
  v_findings := coalesce(v_row.payload->'findings','[]'::jsonb);
  if jsonb_typeof(coalesce(p_payload->'findings','[]'::jsonb)) <> 'array' then raise exception 'Hallazgos inválidos'; end if;
  for v_finding in select value from jsonb_array_elements(coalesce(p_payload->'findings','[]'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(v_findings) f where f->>'id'=v_finding->>'id') then
      if jsonb_typeof(v_finding) <> 'object' then raise exception 'Hallazgo inválido'; end if;
      v_findings := v_findings || jsonb_build_array((v_finding - array['authorId','authorName','authorRole','at']) || jsonb_build_object('id',coalesce(nullif(v_finding->>'id',''),gen_random_uuid()::text),'authorId',auth.uid(),'authorName',v_name,'authorRole',v_role,'at',v_now));
    end if;
  end loop;
  v_payload := v_payload || jsonb_build_object('findings',v_findings);
  if v_exists then
    update public.orders set payload=v_payload,assigned_member_id=nullif(v_payload->>'owner',''),revision=revision+1,updated_at=v_now where id=v_id returning * into v_row;
  else
    insert into public.orders (id,created_by,assigned_member_id,payload) values (v_id,auth.uid(),nullif(v_payload->>'owner',''),v_payload) returning * into v_row;
  end if;
  return v_row;
end; $$;

create or replace function public.submit_work_report(p_order_id text,p_report jsonb) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_app_role(); v_row public.orders; v_name text;
  v_id text := coalesce(nullif(p_report->>'id',''),gen_random_uuid()::text);
  v_report jsonb; v_progress numeric; v_status text; v_now timestamptz := now(); v_existing public.work_reports;
begin
  if auth.uid() is null or v_role is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
  select * into v_row from public.orders where id=p_order_id for update;
  if not found then raise exception 'Solicitud desconocida'; end if;
  if not coalesce((v_role in ('admin','coordinator') or (v_role='technician' and v_row.assigned_member_id=public.current_member_id())),false) then
    raise exception 'Solo el técnico asignado o coordinación pueden registrar partes' using errcode='42501';
  end if;
  if jsonb_typeof(p_report) is distinct from 'object' or length(p_report::text)>12000000 then raise exception 'Parte inválido o demasiado grande'; end if;
  select * into v_existing from public.work_reports where id=v_id;
  if found then
    if v_existing.order_id=p_order_id and v_existing.author_id=auth.uid() then return v_row; end if;
    raise exception 'Identificador de parte duplicado';
  end if;
  if length(trim(coalesce(p_report->>'notes',p_report->>'note',''))) < 3 then raise exception 'Describe el trabajo realizado'; end if;
  v_progress := coalesce((p_report->>'progress')::numeric,(v_row.payload->>'progress')::numeric,0);
  if v_progress < 0 or v_progress > 100 then raise exception 'Avance inválido'; end if;
  v_status := coalesce(p_report->>'status',case when v_progress=100 then 'completed' when v_progress>0 then 'progress' else 'pending' end);
  if v_status not in ('pending','progress','completed') then raise exception 'Estado inválido'; end if;
  if v_status='completed' then v_progress:=100; elsif v_progress=100 then raise exception 'Un avance de 100 debe cerrar el trabajo'; end if;
  if p_report ? 'photos' and jsonb_typeof(p_report->'photos')<>'array' then raise exception 'Fotografías inválidas'; end if;
  if p_report->>'hours' is not null and ((p_report->>'hours')::numeric<0 or (p_report->>'hours')::numeric>10000) then raise exception 'Horas inválidas'; end if;
  select name into v_name from public.profiles where id=auth.uid();
  v_report := jsonb_build_object('id',v_id,'authorId',auth.uid(),'authorName',v_name,'authorRole',v_role,'at',v_now,
    'notes',coalesce(p_report->>'notes',p_report->>'note'),'progress',v_progress,'status',v_status,
    'photos',coalesce(p_report->'photos','[]'::jsonb),'hours',p_report->'hours','materials',p_report->'materials');
  insert into public.work_reports(id,order_id,author_id,payload) values(v_id,p_order_id,auth.uid(),v_report);
  update public.orders set payload=payload || jsonb_build_object('progress',v_progress,'status',v_status,
    'startedAt',coalesce(nullif(payload->'startedAt','null'::jsonb),to_jsonb(v_now)),
    'closedAt',case when v_status='completed' then coalesce(nullif(payload->'closedAt','null'::jsonb),to_jsonb(v_now)) else 'null'::jsonb end,
    'reports',coalesce(payload->'reports','[]'::jsonb) || jsonb_build_array(v_report),
    'updates',coalesce(payload->'updates','[]'::jsonb) || jsonb_build_array(jsonb_build_object('id',v_id,'at',v_now,'authorId',auth.uid(),'authorName',v_name,'authorRole',v_role,'progress',v_progress,'note',v_report->>'notes'))),
    revision=revision+1,updated_at=v_now where id=p_order_id returning * into v_row;
  return v_row;
end; $$;

create or replace function public.save_module_record(p_module text,p_id text,p_payload jsonb) returns public.module_records
language plpgsql security definer set search_path = '' as $$
declare v_row public.module_records; v_exists boolean; v_payload jsonb := p_payload; v_role text := public.current_app_role(); v_name text; v_changes jsonb;
begin
  if auth.uid() is null or not coalesce((v_role in ('admin','coordinator') or (v_role='technician' and p_module='protocolRuns')),false) then raise exception 'Coordinación requerida' using errcode='42501'; end if;
  if p_module not in ('preventivePlans','preventiveRuns','rooms','roomHistory','energyRecords','rounds','capex','budgetEntries','monthlyBudgets','dailyReadings','gasDeliveries','wasteReadings','protocols','protocolRuns','purchaseOrders','reportSnapshots','__settings') then raise exception 'Módulo desconocido'; end if;
  if length(coalesce(p_id,'')) not between 1 and 160 or jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>16000000 then raise exception 'Registro inválido'; end if;
  select * into v_row from public.module_records where module=p_module and id=p_id for update; v_exists:=found;
  if p_module='protocolRuns' and v_exists and v_row.payload->>'status'='completed' then
    raise exception 'Una ejecución cerrada se conserva sin modificar' using errcode='42501';
  end if;
  if v_role='technician' then
    if v_exists and (v_row.payload->>'actorId' is distinct from auth.uid()::text or v_row.payload->>'status' is distinct from 'open') then
      raise exception 'Solo puedes continuar una ejecución propia abierta' using errcode='42501';
    end if;
    select name into v_name from public.profiles where id=auth.uid();
    if v_exists then
      select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_changes
      from jsonb_each(p_payload) where key in ('steps','notes','location','orderReference','approvals','photos','entryAllowed','reservePercent','updatedAt','closedAt','status','events','system','equipmentId','scope','estimatedHours');
      v_payload := v_row.payload || v_changes;
    end if;
    v_payload := v_payload || jsonb_build_object('actorId',auth.uid(),'actorName',v_name,'actorRole',v_role,'recordedAt',coalesce(v_row.payload->'recordedAt',to_jsonb(now())),'updatedAt',now(),
      'serverAudit',coalesce(v_row.payload->'serverAudit','[]'::jsonb) || jsonb_build_array(jsonb_build_object('at',now(),'actorId',auth.uid(),'status',v_payload->>'status')));
    if v_payload->>'status'='completed' then v_payload:=v_payload || jsonb_build_object('closedAt',now()); end if;
  end if;
  if v_exists and p_payload ? '_cloudRevision' and (p_payload->>'_cloudRevision' is null or (p_payload->>'_cloudRevision')::bigint<>v_row.revision) then raise exception 'Registro modificado en otro dispositivo. Actualiza antes de guardar.' using errcode='40001'; end if;
  insert into public.module_records(module,id,payload,updated_by) values(p_module,p_id,v_payload-'_cloudRevision',auth.uid())
  on conflict(module,id) do update set payload=excluded.payload,revision=module_records.revision+1,updated_by=auth.uid(),updated_at=now() returning * into v_row;
  return v_row;
end; $$;

create or replace function public.delete_module_record(p_module text,p_id text,p_revision bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_revision bigint;
begin
  if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','coordinator') then raise exception 'Coordinación requerida' using errcode='42501'; end if;
  select revision into v_revision from public.module_records where module=p_module and id=p_id for update;
  if p_revision is not null and v_revision is distinct from p_revision then raise exception 'Registro modificado en otro dispositivo' using errcode='40001'; end if;
  if p_module in ('roomHistory','preventiveRuns','protocolRuns','reportSnapshots') then raise exception 'El historial no se elimina desde la aplicación'; end if;
  delete from public.module_records where module=p_module and id=p_id;
end; $$;

revoke all on function public.admin_set_profile(uuid,text,text),public.save_order(jsonb),public.submit_work_report(text,jsonb),public.save_module_record(text,text,jsonb),public.delete_module_record(text,text,bigint) from public;
grant execute on function public.admin_set_profile(uuid,text,text),public.save_order(jsonb),public.submit_work_report(text,jsonb),public.save_module_record(text,text,jsonb),public.delete_module_record(text,text,bigint) to authenticated;
commit;
