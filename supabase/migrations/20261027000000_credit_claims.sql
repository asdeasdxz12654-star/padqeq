-- 크레딧 연결 요청: 미가입자 이름으로 표시된 크레딧(external)을 가입한 본인이 "내 크레딧"이라고 요청하고,
-- 게시물 작성자가 승인하면 그 회원 크레딧(approved)으로 바꾼다.
--  · 볼 수 있는 남의 글의 미가입 크레딧만 · 크레딧마다 대기 중인 요청은 회원당 하나 · 하루 10건
--  · 처리는 작성자만 resolve_credit_claim()으로. 승인하면 같은 크레딧의 다른 요청은 거절된다
--  · 요청 · 결과는 알림으로 알린다

alter type public.notification_kind add value if not exists 'credit_claimed';
alter type public.notification_kind add value if not exists 'credit_claim_approved';
alter type public.notification_kind add value if not exists 'credit_claim_rejected';

create type public.claim_status as enum ('open', 'approved', 'rejected');

create table public.credit_claims (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.credits (id) on delete cascade,
  claimant_id uuid not null references public.profiles (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 300),
  status public.claim_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index credit_claims_one_open on public.credit_claims (credit_id, claimant_id) where status = 'open';
create index credit_claims_claimant_idx on public.credit_claims (claimant_id, created_at desc);
create index credit_claims_credit_idx on public.credit_claims (credit_id);

alter table public.credit_claims enable row level security;
revoke all on public.credit_claims from public, anon, authenticated;
grant select on public.credit_claims to authenticated;
grant insert (credit_id, claimant_id, note) on public.credit_claims to authenticated;

-- 요청한 본인 · 그 글의 작성자 · 운영자
create policy "내 요청 · 내 글에 온 요청" on public.credit_claims
  for select to authenticated
  using (
    claimant_id = (select auth.uid())
    or exists (select 1 from public.credits c where c.id = credit_id and private.is_post_author(c.post_id))
    or (select private.is_admin())
  );
create policy "볼 수 있는 남의 글의 미가입 크레딧을 요청한다" on public.credit_claims
  for insert to authenticated
  with check (
    claimant_id = (select auth.uid())
    and exists (
      select 1 from public.credits c
      where c.id = credit_id and c.status = 'external' and private.post_is_visible(c.post_id)
        and not private.is_post_author(c.post_id)
    )
  );

create function private.before_credit_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.credit_claims
      where claimant_id = new.claimant_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'claim_rate_limited' using errcode = 'P0001';
  end if;
  new.note := btrim(new.note);
  return new;
end;
$$;
create trigger credit_claims_rules
before insert on public.credit_claims
for each row execute function private.before_credit_claim();

create function private.notify_credit_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post uuid;
  author uuid;
begin
  select c.post_id, p.author_id into post, author
  from public.credits c join public.posts p on p.id = c.post_id where c.id = new.credit_id;
  if tg_op = 'INSERT' then
    perform private.notify(author, 'credit_claimed'::public.notification_kind, new.claimant_id, post);
  elsif old.status = 'open' and new.status = 'approved' then
    perform private.notify(new.claimant_id, 'credit_claim_approved'::public.notification_kind, author, post);
  elsif old.status = 'open' and new.status = 'rejected' then
    perform private.notify(new.claimant_id, 'credit_claim_rejected'::public.notification_kind, author, post);
  end if;
  return null;
end;
$$;
create trigger credit_claims_notify
after insert or update of status on public.credit_claims
for each row execute function private.notify_credit_claim();

create function public.resolve_credit_claim(target uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.credit_claims%rowtype;
begin
  select * into claim from public.credit_claims where id = target and status = 'open' for update;
  if not found or not exists (
    select 1 from public.credits c join public.posts p on p.id = c.post_id
    where c.id = claim.credit_id and p.author_id = (select auth.uid())
  ) then
    raise exception 'claim_not_found' using errcode = '42501';
  end if;

  if not accept then
    update public.credit_claims set status = 'rejected', resolved_at = now() where id = target;
    return;
  end if;

  -- 같은 글에 이 회원이 같은 역할로 이미 있으면 미가입 표기만 지운다
  if exists (
    select 1 from public.credits mine, public.credits ext
    where ext.id = claim.credit_id and mine.post_id = ext.post_id and mine.role = ext.role
      and mine.member_id = claim.claimant_id
  ) then
    update public.credit_claims set status = 'approved', resolved_at = now() where id = target;
    delete from public.credits where id = claim.credit_id;
  else
    update public.credits
    set member_id = claim.claimant_id, status = 'approved', external_label = null, external_url = null
    where id = claim.credit_id and status = 'external';
    update public.credit_claims set status = 'approved', resolved_at = now() where id = target;
    update public.credit_claims set status = 'rejected', resolved_at = now()
    where credit_id = claim.credit_id and status = 'open' and id <> target;
  end if;
end;
$$;

revoke all on function private.before_credit_claim(), private.notify_credit_claim() from public, anon, authenticated;
revoke all on function public.resolve_credit_claim(uuid, boolean) from public, anon, authenticated;
grant execute on function public.resolve_credit_claim(uuid, boolean) to authenticated;
