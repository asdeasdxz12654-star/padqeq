-- 크레딧 연결 요청은 운영자가 확인한다 (S-19 ②: 남의 크레딧을 가로채지 못하게)
--  · 지금까지는 글 작성자가 승인했다. 작성자는 요청을 보기만 하고, 승인 · 거절은 운영자만 한다.
--  · SNS 링크 자동 확인 · 확인 코드 방식은 프로필 외부 링크 기능과 함께 붙인다
--  · 결과는 요청한 사람에게 알리고, 승인되면 글 작성자에게도 알린다

create or replace function public.resolve_credit_claim(target uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.credit_claims%rowtype;
begin
  if not private.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select * into claim from public.credit_claims where id = target and status = 'open' for update;
  if not found then
    raise exception 'claim_not_found' using errcode = 'P0001';
  end if;

  if not accept then
    update public.credit_claims set status = 'rejected', resolved_at = now() where id = target;
  elsif exists (
    -- 같은 글에 이 회원이 같은 역할로 이미 있으면 미가입 표기만 지운다
    select 1 from public.credits mine, public.credits ext
    where ext.id = claim.credit_id and mine.post_id = ext.post_id and mine.role = ext.role
      and mine.member_id = claim.claimant_id
  ) then
    -- 알림이 글을 찾을 수 있게 표기를 지우기 전에 승인 처리
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

  insert into private.audit_log (actor_id, action, target_table, target_id, detail)
  values ((select auth.uid()), 'credit_claim', 'credit_claims', target, jsonb_build_object('accept', accept));
end;
$$;

-- 알림: 요청이 들어와도 작성자에게 승인을 부탁하지 않는다(운영자 대기열). 결과는 요청자에게, 승인은 작성자에게도.
create or replace function private.notify_credit_claim()
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
  if post is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'open' and new.status = 'approved' then
    perform private.notify(new.claimant_id, 'credit_claim_approved'::public.notification_kind, null, post);
    perform private.notify(author, 'credit_approved'::public.notification_kind, new.claimant_id, post);
  elsif tg_op = 'UPDATE' and old.status = 'open' and new.status = 'rejected' then
    perform private.notify(new.claimant_id, 'credit_claim_rejected'::public.notification_kind, null, post);
  end if;
  return null;
end;
$$;
