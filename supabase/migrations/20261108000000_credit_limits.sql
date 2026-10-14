-- 크레딧 요청 남발 막기 (회원 업로드를 열기 전에)
--  · 나를 차단한 회원 · 내가 차단한 회원에게는 요청할 수 없다
--  · 같은 글에서 거절하거나 스스로 뺀 회원에게 다시 요청할 수 없다 (거절 기록을 남긴다)
--  · 같은 글에 같은 회원 · 같은 역할 요청은 하나만 · 한 회원에게 대기 중인 요청은 20개까지 · 하루 100건까지
--  · 나 자신 · 미가입자 표기(external)는 제한하지 않는다

create table private.credit_declines (
  post_id uuid not null references public.posts (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, member_id)
);
alter table private.credit_declines enable row level security;
revoke all on private.credit_declines from public, anon, authenticated;

create function private.before_credit_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  if new.member_id is null or new.status <> 'pending' then
    return new;
  end if;
  select author_id into author from public.posts where id = new.post_id;
  if author is null or author = new.member_id then
    return new;
  end if;

  if private.blocked_between(author, new.member_id) then
    raise exception 'credit_blocked' using errcode = '42501';
  end if;
  if exists (select 1 from private.credit_declines where post_id = new.post_id and member_id = new.member_id) then
    raise exception 'credit_declined_before' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.credits where post_id = new.post_id and member_id = new.member_id and role = new.role) then
    raise exception 'credit_duplicate' using errcode = 'P0001';
  end if;
  if (select count(*) from public.credits c join public.posts p on p.id = c.post_id
      where p.author_id = author and c.member_id = new.member_id and c.status = 'pending') >= 20 then
    raise exception 'credit_pending_limit' using errcode = 'P0001';
  end if;
  if (select count(*) from public.credits c join public.posts p on p.id = c.post_id
      where p.author_id = author and c.member_id is not null and c.member_id <> author
        and c.created_at > now() - interval '1 day') >= 100 then
    raise exception 'credit_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger credits_request_rules before insert on public.credits
  for each row execute function private.before_credit_request();

-- 당사자가 거절하거나 스스로 빼면 기록한다 (글쓴이가 지운 것은 기록하지 않음)
create function private.remember_credit_decline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.member_id is not null and old.member_id = (select auth.uid()) then
      insert into private.credit_declines (post_id, member_id) values (old.post_id, old.member_id) on conflict do nothing;
    end if;
    return null;
  end if;
  if new.status = 'rejected' and old.status is distinct from 'rejected' and new.member_id is not null then
    insert into private.credit_declines (post_id, member_id) values (new.post_id, new.member_id) on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger credits_remember_decline after update of status or delete on public.credits
  for each row execute function private.remember_credit_decline();

revoke all on function private.before_credit_request(), private.remember_credit_decline() from public, anon, authenticated;
