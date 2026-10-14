-- 금칙어 · 신규 계정 링크 제한 (P-04 댓글 · P-02 스팸 · A-05 금칙어)
--  · 금칙어는 운영자가 관리한다. 댓글 · 게시판 글 · 답글 · 메시지에 들어 있으면 거부한다 (대소문자 · 띄어쓰기 무시).
--  · 가입 7일이 안 된 계정은 댓글 · 게시판 글 · 답글에도 링크를 쓸 수 없다 (메시지는 이미 적용)
--  · 운영자는 적용하지 않는다

create table public.banned_words (
  word text primary key check (char_length(word) between 1 and 40 and word = lower(btrim(word))),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.banned_words enable row level security;
revoke all on public.banned_words from public, anon, authenticated;
grant select, delete on public.banned_words to authenticated;
grant insert (word, created_by) on public.banned_words to authenticated;
create policy "운영자만 금칙어를 본다" on public.banned_words for select to authenticated using ((select private.is_admin()));
create policy "운영자가 금칙어를 넣는다" on public.banned_words for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));
create policy "운영자가 금칙어를 뺀다" on public.banned_words for delete to authenticated using ((select private.is_admin()));

-- 띄어쓰기 · 기호를 빼고 비교한다 (예: "광 고" · "광-고")
create function private.squash(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(value, ''), '[[:space:][:punct:]]', '', 'g'));
$$;

create function private.has_link(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(value, '') ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|kr|io|me|co|org|ly|gg)(/|\s|$))';
$$;

-- 글쓴이 · 글을 받아 금칙어 · 신규 계정 링크를 검사한다
create function private.check_text(author uuid, value text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if author is null or exists (select 1 from public.profiles where id = author and role = 'admin') then
    return;
  end if;
  if exists (select 1 from public.banned_words w where position(private.squash(w.word) in private.squash(value)) > 0) then
    raise exception 'banned_word' using errcode = 'P0001';
  end if;
  if private.has_link(value) and (select created_at from public.profiles where id = author) > now() - interval '7 days' then
    raise exception 'links_not_allowed' using errcode = 'P0001';
  end if;
end;
$$;

create function private.check_text_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case tg_table_name
    when 'comments' then perform private.check_text(new.author_id, new.body);
    when 'board_posts' then perform private.check_text(new.author_id, new.title || ' ' || new.body);
    when 'board_replies' then perform private.check_text(new.author_id, new.body);
    when 'messages' then perform private.check_text(new.sender_id, new.body);
  end case;
  return new;
end;
$$;

create trigger comments_check_text before insert or update of body on public.comments
  for each row execute function private.check_text_trigger();
create trigger board_posts_check_text before insert or update of title, body on public.board_posts
  for each row execute function private.check_text_trigger();
create trigger board_replies_check_text before insert or update of body on public.board_replies
  for each row execute function private.check_text_trigger();
create trigger messages_check_text before insert on public.messages
  for each row execute function private.check_text_trigger();

revoke all on function private.squash(text), private.has_link(text), private.check_text(uuid, text), private.check_text_trigger()
  from public, anon, authenticated;
