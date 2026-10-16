# 운빨냥국배틀

주사위로 자원을 얻고, 카드로 고양이 병사와 건물을 배치하는 턴제 판타지 영토 게임입니다. 이름은 가칭입니다.

안개 속 시작 위치, 자원을 주는 숫자, 뽑히는 카드가 매 판을 바꿉니다. 얻은 운을 바탕으로 냥국을 넓히고 상대 왕성을 공략합니다.

## 문서 안내

| 문서 | 내용 |
|---|---|
| [작업 지침](AGENTS.md) | 글쓰기, 파일명, 문서 갱신 방법 |
| [게임 설계](docs/game-design.md) | 현재 규칙, 클래스, 남은 설계 |
| [대화 맥락](docs/project-context.md) | 결정한 이유, 바뀐 규칙, 다음 작업 |

현재는 **타이틀 화면 구현 단계**입니다. 하늘 → 동산 → 자원 지형 → 왕성 → 세 고양이 → 로고 → 시작 문구가 차례로 등장합니다. 터치·클릭·Enter로 시작하고, 건너뛰기와 다시 보기를 지원합니다. 시작 후에는 다음 화면 준비 안내가 나옵니다. 게임 플레이는 아직 없습니다.

![실제 구현한 타이틀 화면](docs/images/title-screen.webp)

## 실행

Node.js 22.12 이상에서 실행합니다.

```sh
npm ci
npm run dev
```

표시된 로컬 주소를 브라우저로 엽니다. `index.html`을 직접 열면 실행되지 않습니다. 휴대폰에서 접속할 때는 `npm run dev -- --host 0.0.0.0`을 쓰고 같은 네트워크의 PC 주소로 접속합니다.

```sh
npm run build
npm run preview
npx playwright install chromium
npm test
```

테스트 전에는 빌드를 새로 만듭니다. `dist/`가 배포할 결과입니다. 하위 경로에서도 실행할 수 있도록 상대 경로로 빌드합니다. 외부 CDN 없이 이미지와 폰트를 제공합니다.

## 개발 도구

| 도구 | 쓰는 이유 |
|---|---|
| Vite | 개발 서버와 배포용 빌드 |
| Web Animations API | 이미지의 이동·회전·확대 연출. 별도 애니메이션 라이브러리 없이 처리 |
| Sharp | 원본 PNG에서 투명 여백을 잘라 WebP 생성 |
| fonteditor-core | 현재 화면에 쓰는 글자만 폰트에 남겨 용량 절감 |
| Playwright | 등장 순서, 화면 크기, 입력, 로딩 실패 자동 확인 |
| Pretendard | 실제 폰트 파일을 포함. 한글과 영문 UI에 적용 |

[Ponytail](.agents/skills/ponytail/SKILL.md)은 공식 저장소의 `6f1c2bf` 판을 포함했습니다. 기존 기능·브라우저 기본 기능을 먼저 쓰고, 필요한 라이브러리를 선택합니다. 출처: [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail/tree/6f1c2bfff0c837d268929a7c4e490918eb4fab29), MIT 라이선스 포함.

이미지 원본은 `assets/title/`, 실행용 생성물은 `public/title/`, 글꼴 생성물은 `src/generated/`, 화면 코드는 `src/`, 자동 검증은 `tests/`에서 관리합니다. 배치 기준은 `assets/title/layout.json` 한 곳에서 수정합니다. UI 문구를 추가하면 `npm run assets`를 다시 실행해 필요한 글자를 포함합니다. 지형은 코드의 고정 영역으로 나눠 순서대로 등장합니다.

아트는 ChatGPT 이미지젠으로 제작합니다. 메인 캐릭터와 타이틀 원본은 [게임 설계](docs/game-design.md#메인-콘셉트)에 있습니다. Pretendard의 글자 모양을 유지한 부분 글꼴을 생성합니다. OFL 라이선스에 맞춰 생성물 이름은 `Catfantagy UI`로 바꾸고, 원 저작권과 라이선스는 `public/licenses/pretendard.txt`에 포함했습니다.

같은 주제의 변경은 위 문서에 반영합니다. 이전 내용은 GitHub 변경 기록에서 확인합니다.

다음 작업과 단계별 완료 기준은 [개발 순서](docs/project-context.md#개발-순서)에 정리했습니다.
