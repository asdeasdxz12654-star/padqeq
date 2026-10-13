-- 사진 파일 정리
--  · 사진 행이 지워지면(게시물 삭제 · 초안 취소 · 탈퇴 영구 삭제) 파일 위치를 private.storage_trash에 남긴다
--  · 7일 넘게 게시하지 않은 초안은 지운다 (업로드 도중 그만둔 것)
--  · 매일 DB 백업 직후 GitHub Actions가 7일 지난 항목의 R2 파일을 지우고 완료 처리한다
--    (7일은 최근 백업으로 되살렸을 때 파일이 남아 있도록 두는 여유)

create table private.storage_trash (
  storage_key text primary key check (storage_key ~ '^p/[0-9a-f]{32}$'),
  queued_at timestamptz not null default now()
);
alter table private.storage_trash enable row level security;
revoke all on private.storage_trash from public, anon, authenticated;

create function private.queue_storage_trash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.storage_trash (storage_key)
  select storage_key from old_rows
  where storage_key ~ '^p/[0-9a-f]{32}$'
  on conflict (storage_key) do nothing;
  return null;
end;
$$;
revoke all on function private.queue_storage_trash() from public, anon, authenticated;

create trigger photos_queue_storage_trash
after delete on public.photos
referencing old table as old_rows
for each statement execute function private.queue_storage_trash();

-- 오래된 초안 삭제. 지운 게시물 수를 돌려준다.
create function private.purge_stale_drafts(age interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.posts p
  where p.status = 'draft'
    and p.created_at < now() - age
    and not exists (select 1 from public.consent_records c where c.post_id = p.id);
  get diagnostics removed = row_count;
  if removed > 0 then
    insert into private.audit_log (actor_id, action, target_table, target_id, detail)
    values (null, 'stale_drafts_purged', 'posts', null, jsonb_build_object('count', removed));
  end if;
  return removed;
end;
$$;
revoke all on function private.purge_stale_drafts(interval) from public, anon, authenticated;

-- 파일을 지워도 되는 항목. 그 사이 백업 복구 등으로 사진 행이 되살아난 키는 빼고 목록에서도 지운다.
create function private.storage_trash_due(grace interval default interval '7 days', max_rows integer default 200)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.storage_trash t
  where exists (select 1 from public.photos p where p.storage_key = t.storage_key);

  return query
    select t.storage_key from private.storage_trash t
    where t.queued_at < now() - grace
    order by t.queued_at
    limit least(greatest(max_rows, 1), 1000);
end;
$$;
revoke all on function private.storage_trash_due(interval, integer) from public, anon, authenticated;

-- R2에서 지운 뒤 완료 처리
create function private.storage_trash_done(keys text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.storage_trash where storage_key = any (keys);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function private.storage_trash_done(text[]) from public, anon, authenticated;
