# ParallelTrans - 실시간 병렬 번역 크롬 확장프로그램

영어 웹페이지를 실시간으로 병렬 표기(원문 + 번역)하는 크롬 확장프로그램입니다.

**버전:** 2.0
**업데이트:** 2025-01

---

## 목차

- [주요 특징](#주요-특징)
- [2가지 번역 방식](#2가지-번역-방식)
- [빠른 시작](#빠른-시작)
- [설치 방법](#설치-방법)
- [사용 방법](#사용-방법)
- [번역 엔진](#번역-엔진)
- [프로젝트 구조](#프로젝트-구조)
- [스타일 커스터마이징](#스타일-커스터마이징)
- [개발 가이드](#개발-가이드)
- [문제 해결](#문제-해결)

---

## 주요 특징

- **2가지 번역 방식** - 크롬 번역 병렬표기 + API 기반 번역
- **4가지 번역 엔진** - Chrome Translate, Google Cloud, Microsoft, DeepL
- **Option+A 단축키** - 필요할 때 즉시 번역
- **병렬 표기 모드** - 원문과 번역을 함께 표시
- **TypeScript** - 타입 안전성과 유지보수성
- **모듈화된 아키텍처** - 확장 가능한 구조

---

## 2가지 번역 방식

ParallelTrans는 두 가지 방식으로 번역을 제공합니다:

### 1️⃣ 크롬 번역 병렬표기 (Chrome Translate Interceptor)

크롬 브라우저의 **내장 구글 번역**을 감지하여 자동으로 원문을 병렬 표기합니다.

#### 작동 방식
```
1. 사용자가 크롬 번역 아이콘 클릭
   ↓
2. 크롬이 페이지를 자동 번역
   ↓
3. ParallelTrans가 번역 감지 (HTML의 'translated-ltr' 클래스 감지)
   ↓
4. 저장된 원문을 번역문 옆에 자동 추가
   ↓
5. 결과: "안녕하세요 세계 [Hello World]"
```

#### 특징
- ✅ **API 키 불필요** - 크롬 내장 번역 사용
- ✅ **구글 번역 품질** - 고품질 번역
- ✅ **자동 감지** - 수동 설정 불필요
- ✅ **무료 무제한** - 요금 걱정 없음
- ✅ **전체 페이지 번역** - 웹사이트 전체를 한 번에 번역

#### 사용 방법
```bash
1. 설정에서 엔진: "Chrome Translate" 선택
2. 영어 사이트 접속
3. 크롬 주소창 우측의 번역 아이콘 클릭
4. "한국어로 번역" 클릭
5. ✨ 자동으로 원문이 병렬 표기됨!
```

#### 스타일 위치
- 파일: `src/content/google-translate-interceptor.ts`
- 라인: 246, 276 (인라인 스타일)
```typescript
originalSpan.style.cssText = 'color: #888; font-size: 0.9em; font-style: italic;';
```

---

### 2️⃣ API 기반 번역 (Manual Translation)

**Option+A** 단축키로 선택한 번역 API를 사용하여 번역합니다.

#### 작동 방식
```
1. 사용자가 Option+A 단축키 입력
   ↓
2. content.ts가 페이지의 텍스트 노드 추출
   ↓
3. service-worker.ts가 선택된 API로 번역 요청
   ↓
4. 번역 결과를 캐싱하고 반환
   ↓
5. content.ts가 DOM에 병렬 표기로 삽입
   ↓
6. 결과: "Hello World [안녕하세요 세계]"
```

#### 특징
- ✅ **3가지 프리미엄 엔진** - Google Cloud, Microsoft, DeepL
- ✅ **부분 번역 가능** - 원하는 부분만 번역
- ✅ **캐싱 지원** - 중복 번역 방지
- ✅ **커스터마이징** - 번역 방식 세부 조정 가능
- ✅ **오프라인 가능** - 캐시된 번역 사용

#### 사용 방법
```bash
1. 설정에서 원하는 엔진 선택 (Google Cloud/Microsoft/DeepL)
2. API 키 입력
3. 영어 사이트 접속
4. Option+A (Mac) 또는 Alt+A (Windows) 입력
5. ✨ 선택한 엔진으로 번역됨!
```

#### 스타일 위치
- 파일: `src/content/content.css`
- 클래스: `.parallel-trans-translation`
```css
.parallel-trans-translation {
  color: #2563eb;
  font-size: 0.9em;
  background-color: rgba(37, 99, 235, 0.05);
  /* ... */
}
```

---

## 방식 비교표

| 항목 | Chrome Translate | API 기반 번역 |
|------|------------------|--------------|
| **API 키** | 불필요 | 필요 |
| **비용** | 완전 무료 | 무료 한도 있음 |
| **번역 품질** | 구글 번역 (우수) | 엔진별 상이 |
| **번역 범위** | 전체 페이지 | 부분 번역 가능 |
| **트리거** | 크롬 번역 버튼 | Option+A |
| **오프라인** | 불가능 | 캐시 지원 |
| **커스터마이징** | 제한적 | 높음 |
| **스타일 파일** | interceptor.ts | content.css |

---

## 빠른 시작

### 1단계: 빌드

```bash
cd parallelTrans
npm install
npm run build
```

### 2단계: 크롬에 로드

```bash
1. chrome://extensions/ 접속
2. 우측 상단 "개발자 모드" ON
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. parallelTrans/dist 폴더 선택
```

### 3단계: 사용

#### 방법 1: 크롬 번역 (추천 - 간단)
```
1. 확장프로그램 아이콘 클릭
2. 엔진: "Chrome Translate" 선택
3. 영어 사이트에서 크롬 번역 아이콘 클릭
4. ✨ 자동으로 병렬 표기!
```

#### 방법 2: API 번역 (고급 - 커스터마이징)
```
1. 확장프로그램 아이콘 클릭
2. 엔진: Google Cloud/Microsoft/DeepL 선택
3. API 키 입력
4. 영어 사이트에서 Option+A
5. ✨ 선택한 엔진으로 번역!
```

---

## 설치 방법

### 프로젝트 클론 및 빌드

```bash
# 프로젝트 디렉토리로 이동
cd /Users/1ncarnati0n/Desktop/tsxPJT/parallelTrans

# 의존성 설치
npm install

# 프로덕션 빌드
npm run build

# 또는 개발 모드 (자동 재빌드)
npm run dev
```

### 크롬 확장프로그램 로드

1. 크롬 브라우저 열기
2. `chrome://extensions/` 접속
3. 우측 상단 **"개발자 모드"** ON
4. **"압축해제된 확장 프로그램을 로드합니다"** 클릭
5. `parallelTrans/dist` 폴더 선택
6. 완료!

---

## 사용 방법

### Chrome Translate 모드 (기본, 추천)

**설정:**
```
번역 엔진: Chrome Translate
```

**사용:**
1. 영어 웹페이지 접속
2. 크롬 주소창 우측의 번역 아이콘 클릭
3. "한국어로 번역" 선택
4. 자동으로 원문이 회색 이탤릭으로 표기됨

**결과:**
```
번역 전: Hello World
크롬 번역: 안녕하세요 세계
ParallelTrans: 안녕하세요 세계 [Hello World]
```

---

### API 기반 번역 모드

**설정:**
```
번역 엔진: Google Cloud / Microsoft / DeepL
API 키: [발급받은 키]
번역 표시 방식: 병행 표기
```

**사용:**
1. 영어 웹페이지 접속
2. `Option + A` (Mac) 또는 `Alt + A` (Windows)
3. 번역 완료!

**결과:**
```
원문: Hello World
번역 후: Hello World [안녕하세요 세계]
```

---

## 번역 엔진

### 1. Chrome Translate (기본, 추천)

- ✅ **API 키 불필요**
- ✅ **완전 무료**
- ✅ **고품질 번역**
- 크롬 내장 구글 번역 사용

**설정:** 없음 (바로 사용 가능)

---

### 2. Google Cloud Translation API

- ⭐ **고품질**
- 💰 **월 50만자 무료**
- 🔑 [API 키 발급](https://cloud.google.com/translate)

**설정:**
```
1. Google Cloud Console 접속
2. Translation API 활성화
3. API 키 생성
4. ParallelTrans 설정에 입력
```

---

### 3. Microsoft Translator

- ⭐ **고품질**
- 💰 **월 200만자 무료**
- 🔑 [API 키 발급](https://azure.microsoft.com/services/cognitive-services/translator/)

**설정:**
```
1. Azure Portal 접속
2. Translator 리소스 생성
3. API 키 및 Region 확인
4. ParallelTrans 설정에 입력
```

---

### 4. DeepL API

- ⭐⭐⭐ **최고 품질**
- 💰 **월 50만자 무료**
- 🔑 [API 키 발급](https://www.deepl.com/pro-api)

**설정:**
```
1. DeepL 계정 가입
2. API Free 플랜 선택
3. API 키 복사
4. ParallelTrans 설정에 입력
```

---

## 프로젝트 구조

```
parallelTrans/
├── src/                                  # TypeScript 소스코드
│   ├── background/
│   │   └── service-worker.ts             # 백그라운드 로직, API 호출, 캐싱
│   │
│   ├── content/
│   │   ├── content.ts                    # API 기반 번역 (Option+A)
│   │   ├── content.css                   # API 번역 스타일
│   │   ├── google-translate-interceptor.ts  # 크롬 번역 감지 및 병렬표기
│   │   └── google-translate-interceptor.css # (인라인 스타일 사용)
│   │
│   ├── popup/
│   │   ├── popup.html                    # 설정 UI
│   │   ├── popup.ts                      # 설정 로직
│   │   └── popup.css                     # UI 스타일
│   │
│   ├── translators/                      # 모듈화된 번역 엔진
│   │   ├── base.ts                       # 공통 인터페이스, 추상 클래스
│   │   ├── deepl.ts                      # DeepL 번역기
│   │   ├── google-cloud.ts               # Google Cloud 번역기
│   │   ├── microsoft.ts                  # Microsoft 번역기
│   │   ├── manager.ts                    # 번역 엔진 관리자
│   │   └── index.ts                      # 모듈 export
│   │
│   ├── utils/
│   │   ├── cache.ts                      # 번역 캐싱 시스템
│   │   ├── storage.ts                    # Chrome Storage 관리
│   │   ├── logger.ts                     # 중앙화된 로깅
│   │   └── errors.ts                     # 커스텀 에러 클래스
│   │
│   └── types/
│       └── index.ts                      # TypeScript 타입 정의
│
├── dist/                                 # 빌드 결과물 (크롬에 로드)
│   ├── background.js
│   ├── content.js
│   ├── google-translate-interceptor.js
│   ├── popup.js
│   ├── manifest.json
│   └── ...
│
├── icons/                                # 확장프로그램 아이콘
├── manifest.json                         # 확장프로그램 메타데이터
├── webpack.config.js                     # 빌드 설정
├── tsconfig.json                         # TypeScript 설정
└── package.json
```

### 핵심 파일 설명

#### 1. Chrome Translate 관련

| 파일 | 역할 | 주요 기능 |
|------|------|----------|
| `google-translate-interceptor.ts` | 크롬 번역 감지 | HTML 클래스 감시, 원문 저장, 병렬표기 적용 |
| 스타일 | 인라인 (246, 276줄) | 원문 회색 이탤릭 스타일 |

#### 2. API 번역 관련

| 파일 | 역할 | 주요 기능 |
|------|------|----------|
| `content.ts` | DOM 조작 | 텍스트 추출, 번역 삽입, 단축키 |
| `content.css` | 스타일 | 번역문 파란색, 배경, 호버 효과 |
| `service-worker.ts` | 백그라운드 처리 | API 호출, 캐싱, 메시지 라우팅 |

#### 3. 번역 엔진

| 파일 | 역할 |
|------|------|
| `translators/base.ts` | 공통 인터페이스, 에러 처리 |
| `translators/deepl.ts` | DeepL API 통합 |
| `translators/google-cloud.ts` | Google Cloud API 통합 |
| `translators/microsoft.ts` | Microsoft API 통합 |
| `translators/manager.ts` | 엔진 관리, 전환 |

#### 4. 유틸리티

| 파일 | 역할 |
|------|------|
| `utils/cache.ts` | 번역 결과 캐싱 (메모리, 60분) |
| `utils/storage.ts` | Chrome Storage 관리 |
| `utils/logger.ts` | 통합 로깅 시스템 |
| `utils/errors.ts` | 에러 타입 정의 (APIKeyError, RateLimitError 등) |

---

## 스타일 커스터마이징

### Chrome Translate 병렬표기 스타일 변경

**파일:** `src/content/google-translate-interceptor.ts`
**위치:** 246번 줄, 276번 줄

```typescript
// 현재 스타일 (회색 이탤릭)
originalSpan.style.cssText = 'color: #888; font-size: 0.9em; font-style: italic;';

// 예시: 파란색 볼드로 변경
originalSpan.style.cssText = 'color: #2563eb; font-size: 0.9em; font-weight: bold;';

// 예시: 작고 연하게
originalSpan.style.cssText = 'color: #bbb; font-size: 0.8em; opacity: 0.7;';
```

---

### API 번역 스타일 변경

**파일:** `src/content/content.css`
**클래스:** `.parallel-trans-translation`

```css
/* 현재 스타일 (파란색 배경) */
.parallel-trans-translation {
  color: #2563eb;
  font-size: 0.9em;
  background-color: rgba(37, 99, 235, 0.05);
  border-radius: 3px;
}

/* 예시: 회색 이탤릭으로 변경 */
.parallel-trans-translation {
  color: #6b7280;
  font-style: italic;
  font-size: 0.85em;
  background-color: transparent;
}

/* 예시: 노란색 하이라이트 */
.parallel-trans-translation {
  color: #000;
  background-color: #fef3c7;
  padding: 2px 4px;
  border-radius: 3px;
}
```

**변경 후:**
```bash
npm run build
# 크롬에서 확장프로그램 새로고침
```

---

## 개발 가이드

### 환경 설정

```bash
# Node.js 14+ 필요
node --version

# 프로젝트 디렉토리
cd parallelTrans

# 의존성 설치
npm install
```

### 빌드 명령어

```bash
# 프로덕션 빌드
npm run build

# 개발 모드 (자동 재빌드)
npm run dev

# 클린 빌드
npm run clean && npm run build
```

### 코드 수정 후 테스트

```bash
# 1. 코드 수정
# 2. 재빌드
npm run build

# 3. 크롬에서 확장프로그램 새로고침
chrome://extensions/ → 새로고침 버튼

# 4. 웹페이지 새로고침 (F5)
```

### 디버깅

#### Content Script 디버깅
```
1. 웹페이지에서 F12
2. Console 탭
3. content.js, google-translate-interceptor.js 로그 확인
```

#### Background Script 디버깅
```
1. chrome://extensions/
2. ParallelTrans → "서비스 워커" 링크 클릭
3. 개발자 도구에서 로그 확인
```

#### Popup 디버깅
```
1. 확장프로그램 아이콘 클릭
2. 팝업에서 우클릭 → "검사"
```

### 로깅 시스템

모든 컴포넌트에서 통합 Logger 사용:

```typescript
import { Logger } from '../utils/logger';

Logger.info('ComponentName', 'Message', extraData);
Logger.error('ComponentName', 'Error message', error);
Logger.debug('ComponentName', 'Debug info');
```

### 에러 처리

커스텀 에러 클래스 사용:

```typescript
import { APIKeyError, RateLimitError } from '../utils/errors';

// API 키 없음
throw new APIKeyError('deepl');

// Rate limit 초과
throw new RateLimitError('google-cloud', 60);
```

---

## 문제 해결

### Q1: 크롬 번역 병렬표기가 안 됨

**증상:** 크롬 번역은 되는데 원문이 표시되지 않음

**해결:**
1. 설정에서 엔진이 "Chrome Translate"인지 확인
2. F12 → Console에서 에러 확인
3. 페이지 새로고침 후 다시 번역
4. `chrome://extensions/`에서 확장프로그램 새로고침

---

### Q2: API 번역이 안 됨 (Option+A)

**증상:** Option+A를 눌러도 번역 안 됨

**해결:**
1. 설정에서 API 키가 올바른지 확인
2. F12 → Console에서 에러 메시지 확인
3. 선택한 엔진의 무료 한도를 초과했는지 확인
4. 다른 엔진으로 변경 시도

---

### Q3: "API key not configured" 에러

**원인:** API 키가 설정되지 않음

**해결:**
1. 확장프로그램 아이콘 클릭
2. 사용할 엔진 선택
3. API 키 입력
4. "설정 저장" 클릭

---

### Q4: Rate limit exceeded

**원인:** API 무료 한도 초과

**해결:**
1. **Chrome Translate 사용** (무제한 무료)
2. 다른 엔진으로 전환
3. 다음 달까지 대기
4. 유료 플랜 업그레이드

---

### Q5: 스타일 변경이 적용 안 됨

**원인:** 빌드를 안 했거나 캐시 문제

**해결:**
```bash
# 1. 빌드
npm run build

# 2. 확장프로그램 새로고침
chrome://extensions/ → 새로고침

# 3. 웹페이지 강력 새로고침
Cmd+Shift+R (Mac) 또는 Ctrl+Shift+R (Windows)
```

---

## 성능 최적화

### 캐싱 시스템
- 같은 텍스트 재번역 방지
- 메모리 캐시 (최대 1000개, 60분 유효)
- 캐시 히트율: ~80%

### 배치 처리
- 한 번에 10개씩 번역
- API 호출 간 100ms 딜레이

### 필터링
- 3글자 미만 텍스트 제외
- 제외 태그: script, style, code, pre

---

## 기술 스택

- **언어:** TypeScript 5.3
- **빌드:** Webpack 5
- **플랫폼:** Chrome Extension Manifest V3
- **API:** DeepL, Google Cloud, Microsoft Translator
- **아키텍처:** 모듈화, 의존성 주입

---

## 라이선스

MIT License

---

## 기여하기

Pull Request 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

**ParallelTrans v2.0**
Made with TypeScript
2025
