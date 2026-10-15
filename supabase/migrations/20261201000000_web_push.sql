-- 웹 푸시 알림 (S-11 · 웹앱)
--  · 회원이 기기마다 '알림 받기'를 켜면 그 기기의 푸시 주소(endpoint)를 남긴다. 본인만 보고 지운다.
--  · 푸시에는 내용을 싣지 않는다. 기기가 푸시를 받으면 해담에 로그인한 상태로 새 알림 문구를 가져와 보여 준다
--    (알림 내용이 푸시 회사 서버를 거치지 않는다)
--  · Worker가 1분마다 새 알림을 가져가 보낸다. Worker는 관리자 키 대신 '푸시 전용 토큰'만 갖고,
--    DB에는 그 토큰의 SHA-256만 둔다. 토큰이 맞을 때만 보낼 목록을 내준다.
--  · 1시간 넘게 못 보낸 알림은 보내지 않는다 (밀린 알림이 한꺼번에 울리지 않게)

alter table public.notifications add column pushed_at timestamptz;
create index notifications_push_pending_idx on public.notifications (id) where pushed_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://[^\s]+$' and char_length(endpoint) <= 1000),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
create policy "내 기기" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "내 기기를 지운다" on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- 기기 등록: 같은 기기(endpoint)를 다른 계정이 쓰던 경우 그 연결은 지우고 나에게 붙인다. 한 사람 10대까지.
create function public.register_push_subscription(endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not exists (select 1 from public.profiles where id = me and deletion_requested_at is null) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if endpoint is null or endpoint !~ '^https://[^\s]+$' or char_length(endpoint) > 1000 then
    raise exception 'endpoint_invalid' using errcode = 'P0001';
  end if;
  delete from public.push_subscriptions s where s.endpoint = register_push_subscription.endpoint and s.user_id <> me;
  insert into public.push_subscriptions (user_id, endpoint) values (me, register_push_subscription.endpoint)
  on conflict on constraint push_subscriptions_endpoint_key do nothing;
  -- 오래된 기기부터 정리
  delete from public.push_subscriptions s
  where s.user_id = me and s.id in (
    select id from public.push_subscriptions where user_id = me order by created_at desc offset 10
  );
end;
$$;
revoke all on function public.register_push_subscription(text) from public, anon, authenticated;
grant execute on function public.register_push_subscription(text) to authenticated;

-- 푸시 전용 토큰 (SHA-256만)
create table private.push_dispatch_keys (key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'));
alter table private.push_dispatch_keys enable row level security;
revoke all on private.push_dispatch_keys from public, anon, authenticated;
insert into private.push_dispatch_keys (key_hash) values ('192c2ad283b050562b0e11ef0739d5ac538cc6567694644eacbab29d217a9f4b');

create function private.push_token_ok(token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select token is not null and char_length(token) between 32 and 128
    and exists (select 1 from private.push_dispatch_keys where key_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'));
$$;
revoke all on function private.push_token_ok(text) from public, anon, authenticated;

-- 보낼 기기 목록: 새 알림을 '보냄'으로 표시하고, 받을 사람의 기기 주소를 돌려준다
create function public.claim_push_batch(token text, max_rows integer default 500)
returns table (subscription_id uuid, endpoint text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.push_token_ok(token) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- 1시간 넘게 밀린 알림은 보내지 않고 넘긴다
  update public.notifications set pushed_at = now() where pushed_at is null and created_at < now() - interval '1 hour';
  return query
    with picked as (
      select n.id from public.notifications n
      where n.pushed_at is null
      order by n.id
      limit least(greatest(max_rows, 1), 1000)
      for update skip locked
    ), marked as (
      update public.notifications n set pushed_at = now() from picked where n.id = picked.id returning n.recipient_id
    )
    select distinct s.id, s.endpoint from public.push_subscriptions s where s.user_id in (select recipient_id from marked);
end;
$$;
revoke all on function public.claim_push_batch(text, integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(text, integer) to anon, authenticated;

-- 푸시 회사가 '없는 기기'(404 · 410)라고 답한 주소는 지운다
create function public.drop_push_subscriptions(token text, ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gone integer;
begin
  if not private.push_token_ok(token) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where id = any (ids[1:500]);
  get diagnostics gone = row_count;
  return gone;
end;
$$;
revoke all on function public.drop_push_subscriptions(text, uuid[]) from public, anon, authenticated;
grant execute on function public.drop_push_subscriptions(text, uuid[]) to anon, authenticated;
