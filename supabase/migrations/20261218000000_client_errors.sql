-- 오류 기록 (2026-10-19 점검): 화면에 오류가 나면 오류 번호(digest) · 화면 주소만 모아 관리자 대시보드에 보인다.
--  · 회원이 문의하지 않아도 운영자가 알 수 있게. 누가 겪었는지(회원 · IP · 브라우저)는 남기지 않는다.
--  · 같은 번호 · 화면은 한 줄로 묶어 횟수만 센다. 30일 지난 기록은 매일 정리 작업이 지운다.

create table private.client_errors (
  id bigint generated always as identity primary key,
  digest text not null check (digest ~ '^[0-9A-Za-z_-]{1,64}$'),
  path text not null check (path ~ '^/[^?#[:space:]]{0,199}$'),
  hits integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  unique (digest, path)
);
alter table private.client_errors enable row level security;
revoke all on private.client_errors from public, anon, authenticated;

-- 화면의 오류 경계(error.tsx)가 부른다. 비로그인도 오류는 난다. 형식이 맞지 않으면 조용히 버린다.
-- 함부로 부르는 것을 막으려고 기록은 1,000줄까지만, 한 줄의 횟수는 100,000까지만 센다.
create function public.report_client_error(digest text, path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if digest is null or digest !~ '^[0-9A-Za-z_-]{1,64}$' or path is null or path !~ '^/[^?#[:space:]]{0,199}$' then
    return;
  end if;
  update private.client_errors e
  set hits = least(e.hits + 1, 100000), last_at = now()
  where e.digest = report_client_error.digest and e.path = report_client_error.path;
  if not found and (select count(*) from private.client_errors) < 1000 then
    insert into private.client_errors (digest, path) values (report_client_error.digest, report_client_error.path)
    on conflict on constraint client_errors_digest_path_key do nothing;
  end if;
end;
$$;
revoke all on function public.report_client_error(text, text) from public, anon, authenticated;
grant execute on function public.report_client_error(text, text) to anon, authenticated;

-- 관리자: 최근 오류 (마지막으로 난 순)
create function public.admin_recent_errors(days integer default 7)
returns table (digest text, path text, hits integer, first_at timestamptz, last_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
    select e.digest, e.path, e.hits, e.first_at, e.last_at
    from private.client_errors e
    where e.last_at > now() - make_interval(days => greatest(1, least(days, 30)))
    order by e.last_at desc
    limit 100;
end;
$$;
revoke all on function public.admin_recent_errors(integer) from public, anon, authenticated;
grant execute on function public.admin_recent_errors(integer) to authenticated;

-- 30일 지난 기록 지우기 (매일 정리 작업, DB 관리자 연결 전용)
create function private.purge_old_client_errors()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with gone as (delete from private.client_errors where last_at < now() - interval '30 days' returning 1)
  select count(*)::integer into n from gone;
  return n;
end;
$$;
revoke all on function private.purge_old_client_errors() from public, anon, authenticated;
