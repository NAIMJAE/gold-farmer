# 이벤트 참여 기록 조회 웹

독립적인 Vercel 배포 디렉토리임. 로컬 배치 실행·사용자 SNS 계정 관리 기능은 없음.

```powershell
# 저장소 루트에서
Set-Location web
npm ci
npm test
npm run build
npm run dev
```

Vercel Root Directory는 `web`, Build Command는 `npm run build`, Output Directory는 `dist`임.
환경변수는 `web/.env.example`의 공개 URL·publishable/anon key만 사용함. 로컬 배치의 secret/service_role 키·config·private를 배포하지 않음.

로그인 없이 누구나 전체 참가자의 이벤트 참여 기록을 조회함. DB의 RLS와 권한으로 쓰기·배치 실행은 차단함.

기존 DB는 `supabase/migrations/202611190001_public_board.sql`을 SQL Editor에서 한 번 실행해야 공개 조회가 적용됨. 신규 DB는 migration 두 파일을 파일명 순서대로 실행함.

DB 준비·허용 사용자·배포 절차는 [설치·운영 문서](../agent/docs/Supabase_운영.md) 참고함. DB 테스트는 저장소의 `supabase/migrations/`를 사용하므로 테스트할 때는 저장소 전체가 필요함. 프로덕션 빌드에는 `web/`만 사용함.
