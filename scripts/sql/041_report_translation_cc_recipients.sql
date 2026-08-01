-- Reusable CC recipients for project Stage Reports and their Translation pages.
-- Internal users retain existing project access requirements; external contacts receive email only.

create table if not exists public.report_cc_recipients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  response_id uuid not null references public.term_responses(id) on delete cascade,
  recipient_context text not null default 'report',
  recipient_type text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  external_name text,
  external_email text,
  external_company text,
  external_role text,
  added_by uuid not null references public.profiles(id) on delete restrict,
  email_sent_at timestamptz,
  email_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_cc_recipients_context_check check (recipient_context in ('report','translation')),
  constraint report_cc_recipients_type_check check (recipient_type in ('internal','external')),
  constraint report_cc_recipients_shape_check check (
    (
      recipient_type = 'internal'
      and user_id is not null
      and external_name is null
      and external_email is null
      and external_company is null
      and external_role is null
    )
    or
    (
      recipient_type = 'external'
      and user_id is null
      and length(btrim(coalesce(external_name, ''))) > 0
      and length(btrim(coalesce(external_email, ''))) > 3
    )
  ),
  constraint report_cc_recipients_email_status_check check (
    email_status is null or email_status in ('sent','skipped_unconfigured','skipped_no_email','failed')
  )
);

create unique index if not exists report_cc_internal_unique
  on public.report_cc_recipients(response_id, recipient_context, user_id)
  where recipient_type = 'internal';

create unique index if not exists report_cc_external_unique
  on public.report_cc_recipients(response_id, recipient_context, lower(external_email))
  where recipient_type = 'external';

create index if not exists report_cc_project_user_idx
  on public.report_cc_recipients(project_id, user_id, created_at desc)
  where recipient_type = 'internal';
create index if not exists report_cc_response_context_idx
  on public.report_cc_recipients(response_id, recipient_context, created_at);

create or replace function public.touch_report_cc_recipient_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists report_cc_recipients_touch_updated_at on public.report_cc_recipients;
create trigger report_cc_recipients_touch_updated_at
  before update on public.report_cc_recipients
  for each row execute function public.touch_report_cc_recipient_updated_at();

create or replace function public.protect_report_cc_recipient_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is distinct from old.project_id
    or new.response_id is distinct from old.response_id
    or new.recipient_context is distinct from old.recipient_context
    or new.recipient_type is distinct from old.recipient_type
    or new.user_id is distinct from old.user_id
    or new.external_email is distinct from old.external_email
    or new.added_by is distinct from old.added_by
    or new.created_at is distinct from old.created_at then
    raise exception 'CC recipient identity fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists report_cc_recipients_protect_identity on public.report_cc_recipients;
create trigger report_cc_recipients_protect_identity
  before update on public.report_cc_recipients
  for each row execute function public.protect_report_cc_recipient_identity();

create or replace function public.user_can_access_report_project(target_user_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id is not null
    and (
      exists (
        select 1
        from public.project_user_memberships membership
        where membership.project_id = target_project_id
          and membership.user_id = target_user_id
          and membership.status = 'active'
      )
      or exists (
        select 1
        from public.projects project
        join public.organization_memberships membership
          on membership.organization_id = project.supervising_organization_id
        where project.id = target_project_id
          and membership.user_id = target_user_id
          and membership.status = 'active'
      )
    );
$$;

create or replace function public.can_manage_report_cc(target_response_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.can_access_project_stage(target_project_id)
    and exists (
      select 1
      from public.term_responses response
      join public.project_stage_terms term on term.id = response.project_stage_term_id
      join public.project_stages stage on stage.id = term.project_stage_id
      where response.id = target_response_id
        and response.project_id = target_project_id
        and stage.project_id = target_project_id
        and (
          response.created_by = auth.uid()
          or term.responsible_user_id = auth.uid()
          or public.is_project_admin(target_project_id)
        )
    );
$$;

create or replace function public.report_cc_context_is_editable(target_response_id uuid, target_context text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_context = 'translation'
    or exists (
      select 1
      from public.term_responses response
      where response.id = target_response_id
        and response.status not in ('submitted','under_review','approved','completed')
    );
$$;

revoke all on function public.touch_report_cc_recipient_updated_at() from public;
revoke all on function public.protect_report_cc_recipient_identity() from public;
revoke all on function public.user_can_access_report_project(uuid, uuid) from public;
revoke all on function public.can_manage_report_cc(uuid, uuid) from public;
revoke all on function public.report_cc_context_is_editable(uuid, text) from public;
grant execute on function public.user_can_access_report_project(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_report_cc(uuid, uuid) to authenticated, service_role;
grant execute on function public.report_cc_context_is_editable(uuid, text) to authenticated, service_role;

grant select, insert, update, delete on table public.report_cc_recipients to authenticated;

alter table public.report_cc_recipients enable row level security;

drop policy if exists report_cc_recipients_select on public.report_cc_recipients;
create policy report_cc_recipients_select
on public.report_cc_recipients
for select
to authenticated
using (public.can_access_project_stage(project_id));

drop policy if exists report_cc_recipients_insert on public.report_cc_recipients;
create policy report_cc_recipients_insert
on public.report_cc_recipients
for insert
to authenticated
with check (
  added_by = auth.uid()
  and public.can_manage_report_cc(response_id, project_id)
  and public.report_cc_context_is_editable(response_id, recipient_context)
  and (
    recipient_type = 'external'
    or public.user_can_access_report_project(user_id, project_id)
  )
);

drop policy if exists report_cc_recipients_update on public.report_cc_recipients;
create policy report_cc_recipients_update
on public.report_cc_recipients
for update
to authenticated
using (
  public.can_manage_report_cc(response_id, project_id)
  and public.report_cc_context_is_editable(response_id, recipient_context)
)
with check (
  public.can_manage_report_cc(response_id, project_id)
  and public.report_cc_context_is_editable(response_id, recipient_context)
  and (
    recipient_type = 'external'
    or public.user_can_access_report_project(user_id, project_id)
  )
);

drop policy if exists report_cc_recipients_delete on public.report_cc_recipients;
create policy report_cc_recipients_delete
on public.report_cc_recipients
for delete
to authenticated
using (
  public.can_manage_report_cc(response_id, project_id)
  and public.report_cc_context_is_editable(response_id, recipient_context)
);

comment on table public.report_cc_recipients is
  'Shared CC relationship for Stage Reports and Translation pages. Internal rows reference existing project users; external rows are email-only contacts.';
