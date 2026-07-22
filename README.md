# DEV WALL 프론트엔드

## Setup

1. Node.js 설치
   - Node.js 18 이상 버전을 사용하세요.

2. 프로젝트 의존성 설치

```bash
npm install
```

3. 개발 서버 실행

```bash
npm run dev
```

4. 빌드

```bash
npm run build
```

5. 빌드 결과 미리보기

```bash
npm run preview
```

## 주요 명령어

- `npm run dev` — 개발 서버 실행
- `npm run build` — 프로덕션 빌드 생성
- `npm run preview` — 빌드된 결과 미리보기
- `npm run lint` — ESLint 검사

## API 주소 설정

1. 로컬에서 환경변수 파일 만들기

```bash
cp .env.example .env
```

2. `.env` 파일에서 실제 API 주소로 수정

```env
VITE_API_URL=http://localhost:3000
```

3. Vercel 배포 시 환경변수 설정

- Vercel 프로젝트의 Settings → Environment Variables에서
- 이름: `VITE_API_URL`
- 값: 실제 백엔드 기본 URL(예: `https://your-backend.onrender.com`)

> URL 끝에 `/walls` 같은 API 경로를 붙이지 마세요. 화면 코드가 필요한 경로를 자동으로 추가합니다.

> Vite는 `VITE_` 접두사가 붙은 환경변수만 클라이언트에서 사용할 수 있습니다.

## 주요 기능

- 한 달에 하나씩 자동 생성되는 방명록 벽
- 반복되는 코르크 질감과 압정·접힌 모서리 형태의 포스트잇 디자인
- 상단 추가 포스트잇에서 열리는 중앙 작성 화면
- 2400×1600 벽에서 포스트잇 위치 지정 또는 모바일 자동 배치
- GSAP 기반 등장·호버·기울기 인터랙션
- 색상별 인사·응원·팁·질문·팀원 찾기 필터
- 기술 스택, 외부 링크, 답글 포스트잇
- 브라우저 토큰 기반 수정·이동·삭제
- 5초 간격 새 글 확인과 Render 서버 깨우기 안내
- 허니팟 필드와 429 요청 제한 오류 처리
