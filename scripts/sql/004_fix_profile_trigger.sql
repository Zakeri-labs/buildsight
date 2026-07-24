-- Align handle_new_user with the actual profiles schema (full_name, email).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill full_name for existing users from auth metadata.
update public.profiles p
set full_name = coalesce(
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  nullif(trim(concat_ws(' ',
    u.raw_user_meta_data ->> 'first_name',
    u.raw_user_meta_data ->> 'last_name')), '')
)
from auth.users u
where u.id = p.id and (p.full_name is null or p.full_name = '');
