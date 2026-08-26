-- Create user_read_notifications table to persist per-user notification read/dismiss state
-- isolated to the current user without mutating business records.

create table if not exists public.user_read_notifications (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

create index if not exists user_read_notifications_user_idx
  on public.user_read_notifications(user_id);

alter table public.user_read_notifications enable row level security;

drop policy if exists user_read_notifications_select on public.user_read_notifications;
create policy user_read_notifications_select
  on public.user_read_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_read_notifications_insert on public.user_read_notifications;
create policy user_read_notifications_insert
  on public.user_read_notifications
  for insert
  to authenticated
  with check (auth.uid() = user_id);

comment on table public.user_read_notifications is
  'Tracks notification keys marked as read or dismissed by each individual user.';
