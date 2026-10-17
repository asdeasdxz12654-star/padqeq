-- 행사 제안 때 장소 고르기
--  · 회원도 제안하면서 "어디서 열리는지" 공식 장소 태그를 하나 고를 수 있다 (선택).
--  · 운영자는 승인할 때 그대로 쓰거나 set_event_place로 바꾼다.
--  · 공식 장소 태그만 된다 (승인 대기 · 다른 종류 태그는 막는다).

grant insert (place_tag_id) on public.events to authenticated;

create or replace function private.before_event_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.venue := btrim(new.venue);
  new.description := btrim(new.description);
  if (select count(*) from public.events where proposed_by = new.proposed_by and status = 'proposed') >= 5 then
    raise exception 'event_proposal_limit' using errcode = 'P0001';
  end if;
  if new.ends_on < (now() at time zone 'Asia/Seoul')::date then
    raise exception 'event_past' using errcode = 'P0001';
  end if;
  if new.place_tag_id is not null
     and not exists (select 1 from public.tags where id = new.place_tag_id and kind = 'place' and status = 'official') then
    raise exception 'place_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.before_event_proposal() from public, anon, authenticated;
