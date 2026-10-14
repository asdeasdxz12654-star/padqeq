-- 프로필 꾸미기 (S-09 ①③⑥) · 크레딧 연결 자동 확인 (S-19 ②-①)
--  · 커버: 내 게시물 하나를 골라 대표 사진을 프로필 위에 크게
--  · 외부 링크: https 주소 3개까지 (SNS 등)
--  · 고정: 작업물 탭 맨 위에 내 게시물 3개까지
--  · 크레딧 연결 요청: 미가입 표기의 링크가 요청한 회원의 프로필 외부 링크와 같으면 운영자 확인 없이 바로 연결한다

alter table public.profiles
  add column cover_post_id uuid references public.posts (id) on delete set null,
  add column links text[] not null default '{}'
    check (cardinality(links) <= 3 and array_to_string(links, ' ') !~ '[[:cntrl:]]'),
  add column pinned_post_ids uuid[] not null default '{}' check (cardinality(pinned_post_ids) <= 3);

grant update (cover_post_id, links, pinned_post_ids) on public.profiles to authenticated;

create function private.normalize_url(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select rtrim(regexp_replace(lower(btrim(coalesce(value, ''))), '^https?://(www\.|m\.)?', ''), '/');
$$;

create function private.before_profile_decor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  link text;
begin
  if new.cover_post_id is not null and not exists (
    select 1 from public.posts where id = new.cover_post_id and author_id = new.id and status = 'published'
  ) then
    raise exception 'cover_not_mine' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(new.pinned_post_ids) as pin(id)
    where not exists (select 1 from public.posts where id = pin.id and author_id = new.id)
  ) then
    raise exception 'pin_not_mine' using errcode = 'P0001';
  end if;
  new.links := array(select btrim(l) from unnest(new.links) as l where btrim(l) <> '');
  foreach link in array new.links loop
    if char_length(link) > 200 or link !~ '^https://[^[:space:]]+$' then
      raise exception 'link_invalid' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.before_profile_decor() from public, anon, authenticated;
create trigger profiles_decor_rules before update of cover_post_id, links, pinned_post_ids on public.profiles
  for each row execute function private.before_profile_decor();

-- 크레딧 연결을 실제로 적용 (운영자 처리 · 자동 확인 공용)
create function private.apply_credit_claim(target uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.credit_claims%rowtype;
begin
  select * into claim from public.credit_claims where id = target and status = 'open' for update;
  if not found then
    raise exception 'claim_not_found' using errcode = 'P0001';
  end if;
  if not accept then
    update public.credit_claims set status = 'rejected', resolved_at = now() where id = target;
  elsif exists (
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
revoke all on function private.apply_credit_claim(uuid, boolean) from public, anon, authenticated;

create or replace function public.resolve_credit_claim(target uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  perform private.apply_credit_claim(target, accept);
  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'credit_claim', 'credit_claims', target, jsonb_build_object('accept', accept));
end;
$$;

-- 요청이 들어오면: 표기된 링크가 요청한 회원의 프로필 링크와 같으면 바로 연결
create function private.auto_verify_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
begin
  select external_url into url from public.credits where id = new.credit_id;
  if url is not null and exists (
    select 1 from public.profiles p, unnest(p.links) as l
    where p.id = new.claimant_id and private.normalize_url(l) = private.normalize_url(url)
  ) then
    perform private.apply_credit_claim(new.id, true);
    insert into private.audit_log (actor_id, action, target_table, target_id, detail)
    values (new.claimant_id, 'credit_claim_auto', 'credit_claims', new.id, jsonb_build_object('url', url));
  end if;
  return null;
end;
$$;
revoke all on function private.auto_verify_claim(), private.normalize_url(text) from public, anon, authenticated;
create trigger credit_claims_auto_verify after insert on public.credit_claims
  for each row execute function private.auto_verify_claim();
