-- 신고 증거 · 소명 증빙 보관 (S-14 ⑦ · S-19 ⑦ · P-01)
--  · 신고 증거는 초상권 · 저작권 사유일 때만 붙인다
--  · 처리(신고 종결 · 소명 결정)하고 90일이 지나면 파일을 지운다. 신고 · 소명 기록 자체는 3년 보관.

create or replace function public.add_report_evidence(target uuid, content_type text, bytes integer)
returns table (id uuid, storage_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  why text;
begin
  select r.reason::text into why from public.reports r where r.id = target and r.reporter_id = me and r.status = 'open';
  if why is null then
    raise exception 'report_not_found' using errcode = '42501';
  end if;
  if why not in ('portrait_rights', 'copyright') then
    raise exception 'evidence_not_allowed' using errcode = 'P0001';
  end if;
  if private.is_suspended() then
    raise exception 'member_suspended' using errcode = '42501';
  end if;
  if content_type is null or content_type not in ('image/jpeg', 'image/png', 'image/webp')
     or bytes is null or bytes not between 1 and 10 * 1024 * 1024 then
    raise exception 'evidence_invalid' using errcode = 'P0001';
  end if;
  perform 1 from public.reports r where r.id = target for update;
  if (select count(*) from public.report_evidence e where e.report_id = target) >= 3 then
    raise exception 'evidence_limit' using errcode = 'P0001';
  end if;

  return query
    insert into public.report_evidence as e (report_id, storage_key, content_type, bytes)
    values (target, 'e/' || replace(gen_random_uuid()::text, '-', ''), add_report_evidence.content_type, add_report_evidence.bytes)
    returning e.id, e.storage_key;
end;
$$;

-- 처리 90일 뒤 증거 지우기 (매일 정리 작업, DB 관리자 연결 전용). 지운 파일 수를 돌려준다.
create function private.purge_old_evidence(age interval default interval '90 days')
returns integer
language sql
security definer
set search_path = ''
as $$
  with a as (
    delete from public.report_evidence e using public.reports r
    where r.id = e.report_id and r.status <> 'open' and r.resolved_at < now() - age
    returning 1
  ), b as (
    delete from public.appeal_evidence e using public.appeals ap
    where ap.id = e.appeal_id and ap.status <> 'open' and ap.resolved_at < now() - age
    returning 1
  )
  select ((select count(*) from a) + (select count(*) from b))::integer;
$$;
revoke all on function private.purge_old_evidence(interval) from public, anon, authenticated;
