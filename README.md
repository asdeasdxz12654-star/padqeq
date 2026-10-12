# 해담 (Haedam)

> 해마다, 잊지 않도록 — 코스프레 · 모델 · 풍경 사진을 해마다 담아 두고 다시 꺼내 보는 추억 갤러리

**현재 상태: 개발 1단계 — 기반 공사** (2026-10-12 시작)

## 기획 문서

- 화면 기획서 (캔버스): https://claude.ai/artifact/BByFMXte9uq67HyQG5tQnp
  - 원본 파일: [`docs/wireframes/`](docs/wireframes/) — 회원 화면 S-01~20, 정책 보드 P-01~04, 관리자 A-00~05
- 정책 문서 초안 (이용약관 · 개인정보처리방침 · 운영정책 등): https://claude.ai/artifact/FSgVcUdpuEPsioRNSfzG4T
  - 오픈 전 법률 전문가 검토 필요
- 출시 체크리스트: https://claude.ai/artifact/YLz4WFeiRoZVkkf7XX8fMD

## 핵심 원칙

- 광고 · 구독 없음
- 고화질 유지 (AVIF 긴 변 4000px), 다운로드 없음, 캡처 · AI 수집 방지
- 원본 백업 서비스 아님 · 사진 자동 삭제 없음
- 노출 주의 콘텐츠는 봉인 (성인 인증 미도입, DB 제약으로 차단)

## 구성

| 영역 | 사용 |
| --- | --- |
| 앱 | Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · Zod 4 |
| 실행 | Cloudflare Workers (OpenNext) — `worker.ts`가 CSP nonce · 세션 갱신 · 예약 작업 담당 |
| DB · 로그인 | Supabase (서울 리전, 무료 플랜) — publishable/secret 키, `getClaims()` |
| 사진 · 백업 저장 | Cloudflare R2 (`haedam-photos`, `haedam-backups`) |
| 백업 | GitHub Actions 매일 `pg_dump` → age 암호화 → R2 |

### 보안 기본값

- **CSP**: 요청마다 새 nonce, `strict-dynamic`, 외부 이미지 · iframe 삽입 금지 (`src/lib/security/csp.ts`)
- **RLS**: 모든 테이블 기본 거부. 정책별 동작은 `supabase/tests/rls.test.ts`가 실제 PostgreSQL에서 검증
- **게시 규칙(DB 트리거)**: 사진이 없거나, 사람이 나오는데 촬영 동의 기록이 없으면 게시 불가. 미성년자는 보호자 동의 필수
- **공급망**: pnpm `minimumReleaseAge` 7일 · 프로비넌스 하락 차단 · 외부 출처 의존성 차단, CI 액션은 커밋 SHA 고정
- **AI 수집 거부**: `robots.txt` + `X-Robots-Tag` (실제 차단은 Cloudflare AI 봇 차단 · WAF)

## 개발

Node 24 이상, pnpm 12가 필요합니다.

```bash
pnpm install
cp .env.example .env.local   # Supabase URL · publishable 키 입력
pnpm dev                     # http://localhost:3000
pnpm check                   # 린트 · 타입 · 테스트 (CI와 같음)
```

- `pnpm test`는 Docker 없이 PGlite로 마이그레이션 · RLS를 검증합니다.
- Windows에서는 `opennextjs-cloudflare build`가 심볼릭 링크 권한 문제로 실패합니다. 배포 빌드는 CI(Linux)나 WSL에서 합니다.

## 처음 한 번 설정할 것

1. **Supabase**: 서울 리전 프로젝트 생성 → `pnpm exec supabase link` → `pnpm db:push` → `pnpm db:types`
2. **Cloudflare**: Workers 유료 플랜, R2 버킷 `haedam-photos` · `haedam-backups` 생성(공개 접근 끔), `wrangler.jsonc`의 `vars`에 Supabase URL · publishable 키 입력 → `pnpm cf:types`
3. **백업** (저장소 Settings › Environments › `backup`)
   - 비밀값: `SUPABASE_DB_URL`(Session pooler), `BACKUP_AGE_RECIPIENT`(age 공개키), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`(백업 버킷 전용 토큰)
   - 저장소 변수 `BACKUP_ENABLED=true`로 켜기
   - R2 `haedam-backups` 버킷에 30일 보관 후 삭제 규칙 추가
4. **운영자 계정**: 가입 후 DB 콘솔에서 `update profiles set role = 'admin', can_upload = true where handle = '...'`
