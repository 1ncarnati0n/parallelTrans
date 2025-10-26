# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 코드 작업을 할 때 참고할 수 있는 가이드입니다.

**주요 의사소통: 한국어로 진행합니다.**

## 프로젝트 개요

**ParallelTrans**는 Chrome 확장프로그램(Manifest V3)으로, Option+A/Alt+A 단축키를 사용하여 웹페이지의 텍스트를 병렬 번역합니다.

- **언어**: TypeScript 5.3
- **빌드 시스템**: Webpack 5
- **플랫폼**: Chrome Extension Manifest V3
- **버전**: 2.0
- **구조**: 간단하고 모듈화된 설계 (8개 파일)

---

## 개발 워크플로우

### 빌드 명령어

```bash
# 프로덕션 빌드
npm run build

# 개발 모드 (파일 감시 모드)
npm run dev

# 빌드 폴더 정리
npm run clean && npm run build
```

### Chrome에 확장프로그램 로드하기

1. `npm run build`로 프로젝트 빌드
2. `chrome://extensions/` 접속
3. "개발자 모드" 활성화 (우측 상단 토글)
4. "압축해제된 확장 프로그램을 로드합니다" 클릭
5. `dist/` 폴더 선택

### 변경 사항 테스트하기

코드 수정 후:
1. `npm run build` 실행 (또는 `npm run dev`로 자동 감시)
2. `chrome://extensions/`에서 ParallelTrans의 새로고침 버튼 클릭
3. 대상 웹사이트 접속 후 페이지 강력 새로고침 (Cmd+Shift+R / Ctrl+Shift+R)

### 디버깅

- **Content Script**: 웹페이지에서 개발자도구(F12) 열어 Console 탭에서 로그 확인
- **Service Worker**: `chrome://extensions/` → ParallelTrans → "서비스 워커" 링크 클릭
- **Popup**: 팝업에서 우클릭 → "검사"로 설정 UI 디버깅

---

## 아키텍처 및 핵심 컴포넌트

### 시스템 개요

ParallelTrans는 3가지 주요 컴포넌트로 구성됩니다:

1. **Service Worker (background.ts)** - 번역 로직 및 API 호출
2. **Content Script (content.ts)** - DOM 조작 및 텍스트 추출
3. **Popup UI (popup.ts, popup.html)** - 사용자 설정

### 작동 흐름

```
사용자가 Option+A (Mac) / Alt+A (Windows) 입력
  ↓
Content Script가 텍스트 노드 추출
  - 블록 요소 (p, h1-h6, div, li 등) 단위로 추출
  - 인라인 포맷팅 태그 (strong, em, b, i 등) 무시 - 전체 문장으로 번역
  ↓
Service Worker에 배치 메시지 전송 (최대 10개/요청)
  ↓
Service Worker가:
  1. 캐시 확인 (hitRate 80%)
  2. 속도 제한 대기
  3. Primary 엔진으로 번역 시도
  4. 실패 시 Fallback 엔진으로 재시도
  5. 결과 캐싱
  ↓
Content Script가 번역 결과 DOM에 삽입
  - 병렬 표기: 원문 [번역]
  - 번역만: 번역으로만 표시
```

### 파일별 책임

| 파일 | 책임 | 주요 기능 |
|------|------|----------|
| **background.ts** | Service Worker | 메시지 라우팅, 번역 처리, 캐싱, 속도 제한 |
| **content.ts** | Content Script | DOM 조작, 텍스트 추출, 단축키 처리 |
| **popup.ts** | Popup 로직 | 설정 저장/불러오기, UI 업데이트 |
| **popup.html** | 설정 UI | 엔진 선택, API 키, 언어, 표시 모드 설정 |
| **translators.ts** | 번역 엔진 | DeepL, Microsoft API 구현 |
| **types.ts** | 타입 정의 | 모든 인터페이스 및 타입 정의 |
| **utils.ts** | 유틸리티 | 캐시, 속도 제한, 로깅, 저장소 |
| **content.css** | 스타일링 | 번역 텍스트 스타일 |

---

## 메시지 프로토콜

Content Script와 Service Worker 간 통신:

```typescript
// Content Script에서 Service Worker로
chrome.runtime.sendMessage({
  type: 'batchTranslate',  // 'translate' | 'batchTranslate' | 'getSettings' | 'updateSettings' | 'getCacheStats'
  data: {
    texts: string[],
    sourceLang: string,
    targetLang: string,
  }
}, (response) => {
  // Service Worker의 응답 처리
});
```

메시지 타입:
- `translate`: 단일 텍스트 번역
- `batchTranslate`: 여러 텍스트 한 번에 번역
- `getSettings`: 현재 설정 조회
- `updateSettings`: 설정 저장
- `getCacheStats`: 캐시 통계 조회

---

## 핵심 클래스 및 구현

### TranslationManager (translators.ts)

```typescript
class TranslationManager {
  configure(settings);                                    // 엔진 초기화
  async translate(engine, request);                       // 단일 번역
  async translateBatch(engine, request);                  // 배치 번역
  isConfigured(engine): boolean;                          // 엔진 설정 여부 확인
}
```

### TranslationCache (utils.ts)

- **크기**: 최대 2000개 항목
- **TTL**: 1시간
- **키**: `sourceLang:targetLang:text`
- **통계**: 히트율, 총 요청, 캐시된 요청

### RateLimiter (utils.ts)

- **DeepL**: 5 tokens/시간
- **Microsoft**: 200 tokens/시간
- **방식**: Token bucket 알고리즘

---

## 설정 및 저장소

### Settings 인터페이스

```typescript
interface Settings {
  enabled: boolean;                 // 활성화 여부
  deeplApiKey: string;             // DeepL API 키
  deeplIsFree: boolean;            // DeepL 무료 버전 사용 여부
  microsoftApiKey: string;         // Microsoft API 키
  microsoftRegion: string;         // Microsoft 지역 (기본: 'global')
  sourceLang: string;              // 원본 언어 (기본: 'en')
  targetLang: string;              // 대상 언어 (기본: 'ko')
  primaryEngine: 'deepl' | 'microsoft';  // 주 번역 엔진
  fallbackEngine: 'deepl' | 'microsoft'; // 보조 엔진
  displayMode: 'parallel' | 'translation-only';  // 표시 모드
  batchSize: number;               // 배치 크기 (기본: 10)
  cacheEnabled: boolean;           // 캐싱 활성화
  viewportTranslation: boolean;    // 뷰포트 번역 활성화
}
```

**저장소**: Chrome Storage Sync API 사용 (`StorageManager` 래퍼)

---

## 스타일 시스템

### 번역 텍스트 스타일 (content.css)

```css
.parallel-trans-translation {
  color: #2563eb;                           /* 파란색 */
  font-size: 0.9em;
  background-color: rgba(37, 99, 235, 0.05); /* 연한 파란색 배경 */
  border-radius: 3px;
  padding: 2px 4px;
}

.parallel-trans-wrapper {
  position: relative;
  /* 원문을 포함하는 래퍼 */
}
```

**스타일 커스터마이징**: `content.css`에서 `.parallel-trans-translation` 클래스 수정

### Popup UI 스타일 (popup.html)

- 그라디언트 배경: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
- 너비: 450px
- 전체 화이트 카드 레이아웃

---

## 작업별 주요 파일

### 번역 엔진 수정/추가

- **파일**: `translators.ts`
- **클래스**: `DeepL`, `Microsoft`
- **메서드**: `translate()`, `translateBatch()`, `mapLang()`

새로운 엔진 추가:
1. `translators.ts`에 새로운 클래스 생성
2. `TranslationManager`에 엔진 추가
3. `types.ts`의 `TranslationEngine` 타입 수정
4. `background.ts`에서 엔진 초기화
5. `popup.html`에서 엔진 선택 UI 추가

### API 호출 로직 수정

- **파일**: `translators.ts`의 `DeepL` 또는 `Microsoft` 클래스
- **메서드**: `translate()`, `translateBatch()`, `mapLang()`

**주의**: API 응답 형식이 다르면 파싱 로직 수정 필요

### 캐싱/속도 제한 수정

- **파일**: `utils.ts`
- **클래스**: `TranslationCache`, `RateLimiter`

**커스터마이징**:
- 캐시 크기: `maxSize = 2000`
- 캐시 TTL: `maxAge = 60 * 60 * 1000` (1시간)
- 속도 제한: `tokens`, `limits` 변수

### UI/설정 수정

- **파일**: `popup.html`, `popup.ts`
- **저장소**: `StorageManager` (Chrome Storage Sync API)

### DOM 조작/텍스트 추출

- **파일**: `content.ts`
- **주요 함수**: `getTextNodes()`, `insertTranslation()`, `handleKeydown()`
- **단축키**:
  - `Option+A` (Mac) / `Alt+A` (Windows): 번역 ON/OFF 토글
  - `Option+Q` (Mac) / `Alt+Q` (Windows): 표시 모드 전환 (병렬 표기 ↔ 번역만)
- **텍스트 추출 로직**:
  - 블록 요소 단위로 추출: `P`, `H1-H6`, `DIV`, `LI`, `TD`, `BLOCKQUOTE` 등
  - 인라인 포맷팅 요소 무시: `STRONG`, `EM`, `B`, `I`, `U` 등
  - 결과: 전체 문장이 하나의 단위로 번역됨

### 메시지 프로토콜 수정

- **파일**: `types.ts`의 `MessageType`, `Message` 인터페이스
- **처리**: `background.ts`의 `handleMessage()` 함수

---

## 언어 지원

지원 언어 (코드: 설명):
- en: English
- ko: 한국어
- ja: 日本語
- zh: 中文
- es: Español
- fr: Français
- de: Deutsch

**새 언어 추가**:
1. `translators.ts`의 `mapLang()` 메서드에 매핑 추가
2. `popup.html`의 언어 선택 드롭다운에 옵션 추가

---

## Chrome Manifest 설정

**manifest.json**:
- **Manifest Version**: 3.0 (MV3)
- **Permissions**: storage, activeTab, scripting
- **Host Permissions**:
  - `https://api-free.deepl.com/*`
  - `https://api.cognitive.microsofttranslator.com/*`

새로운 API 추가 시 해당 호스트 권한을 manifest에 추가하세요.

---

## 성능 고려사항

### 캐싱
- 메모리 기반 캐시, 최대 2000개 항목
- TTL: 1시간
- 일반적으로 80% 히트율
- 동일 텍스트 반복 번역 방지

### 배치 처리
- 최대 10개 텍스트/요청 (batchSize 설정)
- 배치 간 대기 시간으로 API 한도 준수
- 배치 실패 시 폴백 엔진으로 자동 재시도

### 속도 제한 (Rate Limiter)
- **DeepL Free**: 1.2초 간격 (약 50 requests/분)
- **Microsoft**: 100ms 간격 (충분한 여유)
- 요청 간 최소 간격 설정으로 429 에러 방지
- 배치 크기를 고려한 추가 대기 시간

### 텍스트 필터링
- 3글자 미만 텍스트 무시
- 스크립트, 스타일 태그 제외
- 인라인 포맷팅 태그 무시 (strong, em 등)

### 디바운싱
- 100ms 딜레이로 배치 처리 최적화
- 동적 콘텐츠 추가 시 그룹화

---

## 로깅 시스템

모든 곳에서 `Logger` 사용:

```typescript
import { Logger } from './utils';

Logger.debug('ComponentName', 'Message', data);     // 디버그
Logger.info('ComponentName', 'Message');            // 정보
Logger.warn('ComponentName', 'Message');            // 경고
Logger.error('ComponentName', 'Message', error);    // 에러
```

**로그 확인**:
- Content Script: 웹페이지 DevTools → Console
- Service Worker: `chrome://extensions/` → "서비스 워커"
- Popup: Popup 우클릭 → "검사"

---

## 일반적인 개발 작업

### 번역 실패 디버깅

1. Service Worker 로그 확인: `chrome://extensions/` → "서비스 워커"
2. Content Script 로그 확인: 웹페이지 DevTools
3. API 자격증명 확인 (popup 설정)
4. 캐시 통계 확인: `getCacheStats` 메시지
5. 속도 제한 초과 여부 확인

### 새로운 번역 엔진 추가

1. `translators.ts`에 새 클래스 구현 (DeepL, Microsoft처럼)
2. `TranslationManager.configure()`에 초기화 로직 추가
3. `TranslationManager.translate/translateBatch()` 메서드에 엔진 선택 로직 추가
4. `types.ts`의 `TranslationEngine` 타입 수정
5. `popup.html`에 엔진 선택 UI 추가

### 표시 스타일 변경

`content.css`의 `.parallel-trans-translation` 클래스 수정 후 빌드:

```bash
npm run build
# 확장프로그램 새로고침: chrome://extensions/ → 새로고침
# 웹페이지 새로고침: Cmd+Shift+R 또는 Ctrl+Shift+R
```

### 캐시 동작 확인

```javascript
// DevTools에서 실행
chrome.runtime.sendMessage({ type: 'getCacheStats' }, (response) => {
  console.log('Cache Stats:', response);
});
```

---

## 테스트 방법

자동 테스트 없음 - 수동 테스팅 방식:

1. `npm run build` 빌드
2. Chrome에 확장프로그램 로드
3. 다양한 웹사이트에서 테스트 (Option+A/Alt+A)
4. DevTools Console에서 에러 확인
5. 캐시 동작 검증 (동일 텍스트 반복 번역)
6. Fallback 엔진 테스트 (주 엔진 API 키 제거)

---

## 주의사항

- **ESLint/Prettier 미설정**: 기존 코드 스타일과 일관성 유지
- **자동 테스트 미설정**: 수동 테스팅 필요
- **간단한 구조**: 8개 파일로 핵심 기능 구현

---

## 참고 자료

- Chrome Extension Manifest V3: https://developer.chrome.com/docs/extensions/mv3/
- DeepL API: https://www.deepl.com/docs-api
- Microsoft Translator: https://learn.microsoft.com/azure/ai-services/translator/
