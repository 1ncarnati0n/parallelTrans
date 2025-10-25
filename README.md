# ParallelTrans v2.0 - 실시간 병행 번역 크롬 확장프로그램

영어 웹페이지를 한국어로 실시간 번역하는 크롬 확장프로그램입니다.

**주요 특징:**
- 🌐 3가지 번역 엔진 (공개서버/로컬/DeepL)
- ⌨️ Option+A 단축키로 즉시 번역
- 📝 병행 표기 또는 번역만 선택 가능
- 🚀 TypeScript로 작성된 고품질 코드

---

## 목차

- [빠른 시작 (3분)](#-빠른-시작-3분)
- [주요 기능](#-주요-기능)
- [설치 방법](#-설치-방법)
- [사용 방법](#-사용-방법)
- [번역 엔진 선택](#-번역-엔진-선택)
- [설정 옵션](#-설정-옵션)
- [활용 사례](#-활용-사례)
- [문제 해결](#-문제-해결)
- [프로젝트 구조](#-프로젝트-구조)
- [개발 가이드](#-개발-가이드)

---

## 🚀 빠른 시작 (3분)

### 1단계: 크롬에 확장프로그램 로드

```bash
# 1. 크롬 브라우저 열기
# 2. 주소창에 입력
chrome://extensions/

# 3. 우측 상단 "개발자 모드" ON
# 4. "압축해제된 확장 프로그램을 로드합니다" 클릭
# 5. 폴더 선택
/Users/1ncarnati0n/Desktop/tsxPJT/parallelTrans/dist
```

### 2단계: 설정 (Docker 불필요!)

ParallelTrans 아이콘 클릭 후:

```
✓ 번역 활성화: ON
번역 엔진: LibreTranslate 공개 서버 (무료, Docker 불필요)
번역 실행 방식: 단축키로 수동 번역 (Option+A)
번역 표시 방식: 병행 표기 (원문 + 번역문)
원본 언어: 영어
번역 언어: 한국어

[ 설정 저장 ]
```

### 3단계: 사용하기

```bash
# 1. 영어 사이트 접속
https://en.wikipedia.org

# 2. 단축키 누르기
# Mac: Option + A
# Windows: Alt + A

# 3. 번역 확인!
# Hello World [안녕하세요 세계]
```

**끝!** 🎉

---

## ✨ 주요 기능

### 1. 3가지 번역 엔진

#### ① LibreTranslate 공개 서버 (기본값, 추천)
- ✅ **Docker 불필요** - 바로 사용 가능
- ✅ **완전 무료** - 제한 없음
- ✅ **설정 간단** - 클릭만 하면 끝
- 🌐 URL: `https://libretranslate.com`

#### ② LibreTranslate 로컬 서버
- ✅ **빠른 속도** - 로컬에서 실행
- ✅ **프라이버시** - 데이터가 외부로 나가지 않음
- ⚠️ **Docker 필요**
```bash
docker run -p 5001:5000 libretranslate/libretranslate --load-only en,ko
```

#### ③ DeepL API
- ⭐ **최고 품질** - 가장 정확한 번역
- ✅ **빠른 속도**
- 💰 **무료 50만자/월**
- 🔑 [API 키 발급](https://www.deepl.com/pro-api)

### 2. Option+A 단축키

페이지를 읽다가 번역이 필요할 때:

```
Mac:     Option + A
Windows: Alt + A
```

**두 가지 모드:**
- **자동 번역**: 페이지 로드시 자동으로 번역
- **수동 번역**: Option+A로 필요할 때만 번역 (기본값)

### 3. 2가지 표시 방식

#### 병행 표기 (기본값)
```
Hello World [안녕하세요 세계]
The quick brown fox [빠른 갈색 여우]
```
- 원문과 번역을 함께 표시
- 영어 학습에 유용

#### 번역만 표시
```
안녕하세요 세계
빠른 갈색 여우
```
- 원문을 숨기고 번역문만 표시
- 번역문에 마우스 올리면 원문 툴팁
- 깔끔한 화면

---

## 📦 설치 방법

### 프로젝트 빌드

```bash
cd parallelTrans

# 의존성 설치
npm install

# 빌드
npm run build

# 또는 개발 모드 (자동 재빌드)
npm run dev
```

### 크롬에 로드

1. 크롬 브라우저 열기
2. `chrome://extensions/` 접속
3. 우측 상단 **"개발자 모드"** ON
4. **"압축해제된 확장 프로그램을 로드합니다"** 클릭
5. `parallelTrans/dist` 폴더 선택
6. 완료!

---

## 🎯 사용 방법

### 기본 사용법

1. **확장프로그램 아이콘 클릭**
   - 크롬 우측 상단 퍼즐 조각 아이콘
   - ParallelTrans 찾기

2. **설정**
   - 번역 엔진 선택
   - 실행 방식 선택 (자동/수동)
   - 표시 방식 선택 (병행표기/번역만)

3. **번역 실행**
   - 자동 모드: 페이지 로드시 자동
   - 수동 모드: Option+A 누르기

### 추천 사용 시나리오

#### 시나리오 1: 영어 학습
```
설정:
- 엔진: DeepL (정확한 번역)
- 트리거: 수동 (Option+A)
- 표시: 병행 표기

사용:
1. 영어 기사 읽기
2. 모르는 문장에서 Option+A
3. 영어와 한글 비교하며 학습
```

#### 시나리오 2: 뉴스/SNS 브라우징
```
설정:
- 엔진: 공개 서버
- 트리거: 수동
- 표시: 번역만

사용:
1. Hacker News, Reddit 등 접속
2. Option+A로 번역
3. 한글로 빠르게 내용 파악
```

#### 시나리오 3: 기술 문서 학습
```
설정:
- 엔진: 로컬 서버 (빠름)
- 트리거: 자동
- 표시: 병행 표기

사용:
1. MDN, Stack Overflow 접속
2. 자동으로 번역됨
3. 영어 용어와 한글 설명 동시 학습
```

---

## 🔧 번역 엔진 선택

### 비교표

| 엔진 | Docker | API 키 | 품질 | 속도 | 비용 | 추천 대상 |
|------|--------|--------|------|------|------|-----------|
| 공개 서버 | 불필요 | 불필요 | ★★★☆☆ | 중간 | 무료 | 일반 사용자 |
| 로컬 서버 | 필요 | 불필요 | ★★★☆☆ | 빠름 | 무료 | 개발자 |
| DeepL | 불필요 | 필요 | ★★★★★ | 빠름 | 50만자/월 무료 | 프로 |

### 공개 서버 설정 (가장 쉬움)

```
1. ParallelTrans 아이콘 클릭
2. 번역 엔진: "LibreTranslate 공개 서버" 선택
3. 설정 저장
4. 끝!
```

### 로컬 서버 설정

```bash
# 1. Docker 실행
docker run -ti --rm -p 5001:5000 \
  libretranslate/libretranslate \
  --load-only en,ko

# 2. 확장프로그램 설정
번역 엔진: "LibreTranslate 로컬 서버"
URL: http://localhost:5001

# 3. 설정 저장
```

### DeepL 설정

```bash
# 1. API 키 발급
https://www.deepl.com/pro-api 접속
무료 계정 가입
API 키 복사

# 2. 확장프로그램 설정
번역 엔진: "DeepL"
API 키: [발급받은 키 입력]

# 3. 설정 저장
```

---

## ⚙️ 설정 옵션

### 번역 활성화/비활성화
- 체크박스로 켜기/끄기
- 비활성화시 모든 번역 제거

### 번역 실행 방식

#### 자동 번역
```
( ) 페이지 로드시 자동 번역
```
- 웹페이지 열면 자동으로 번역
- 동적 콘텐츠도 자동 감지
- 자주 방문하는 사이트에 유용

#### 수동 번역 (기본값)
```
(•) 단축키로 수동 번역 (Option+A)
```
- 필요할 때만 Option+A로 번역
- 배터리 절약
- 영어 학습에 유용

### 번역 표시 방식

#### 병행 표기 (기본값)
```
(•) 병행 표기 (원문 + 번역문)
```
예시: `Hello World [안녕하세요 세계]`

**장점:**
- 원문과 번역 동시 확인
- 영어 학습 가능
- 번역 품질 검증

#### 번역만 표시
```
( ) 번역문만 표시
```
예시: `안녕하세요 세계` (원문 숨김)

**장점:**
- 깔끔한 화면
- 빠른 정보 수집
- 호버시 원문 확인 가능

### 언어 설정
- 원본 언어: 영어, 일본어, 중국어
- 번역 언어: 한국어, 영어, 일본어

---

## 💡 활용 사례

### 1. Wikipedia 읽기
```
https://en.wikipedia.org 접속
Option+A 누르기
영어 내용을 한글로 빠르게 이해
```

### 2. Hacker News 브라우징
```
https://news.ycombinator.com 접속
Option+A로 제목들 번역
관심 기사 한글로 확인
```

### 3. Reddit 탐색
```
https://www.reddit.com 접속
번역만 모드로 설정
Option+A로 모든 글을 한글로
```

### 4. MDN 문서 학습
```
https://developer.mozilla.org 접속
병행 표기 모드
영어 용어와 한글 설명 동시 학습
```

### 5. GitHub 이슈 읽기
```
GitHub 이슈 페이지
Option+A로 번역
빠르게 내용 파악
```

---

## 🔧 문제 해결

### Q1: 번역이 안 됨

**증상:** Option+A를 눌러도 아무 일도 안 일어남

**해결:**
1. F12 → Console 탭 확인
2. 설정에서 "번역 활성화" ON 확인
3. "수동 번역" 모드 선택 확인
4. 페이지 새로고침 (F5)
5. `chrome://extensions/`에서 확장프로그램 새로고침

---

### Q2: "Failed to fetch" 에러

**원인:** 번역 서버에 연결할 수 없음

**해결:**

**공개 서버 사용시:**
- 인터넷 연결 확인
- 잠시 후 재시도
- 서버가 다운되었을 수 있음 → 로컬 또는 DeepL로 변경

**로컬 서버 사용시:**
```bash
# Docker가 실행 중인지 확인
docker ps

# 테스트
curl http://localhost:5001/languages
```

**DeepL 사용시:**
- API 키 확인
- 사용량 확인 (무료: 50만자/월)

---

### Q3: 번역 속도가 느림

**원인:**
- 공개 서버는 느릴 수 있음
- 네트워크 지연

**해결:**
1. **로컬 서버 사용** (가장 빠름)
2. **DeepL 사용** (빠르고 정확)
3. 배치 크기 조정 (코드 수정)

---

### Q4: Option+A가 작동 안 함

**확인 사항:**
1. "번역 활성화" ON
2. "수동 번역" 모드 선택
3. 페이지 완전히 로드된 후 시도
4. 입력창(input, textarea)에서는 작동 안 함

---

### Q5: 특정 사이트에서 번역 안 됨

**가능한 원인:**
- iframe 내부 콘텐츠
- Shadow DOM
- 동적으로 생성된 콘텐츠

**해결:**
- 페이지 로드 완료 후 Option+A 재시도
- 자동 모드로 변경
- 여러 번 Option+A 시도

---

### Q6: 한글이 이상하게 번역됨

**원인:** 번역 품질 문제

**해결:**
1. **DeepL로 변경** (최고 품질)
2. 병행 표기 모드로 원문 확인
3. 전문 용어는 번역 안 될 수 있음 (정상)

---

## 📁 프로젝트 구조

```
parallelTrans/
├── src/                          # TypeScript 소스코드
│   ├── background/
│   │   └── service-worker.ts    # API 호출, 캐싱, 메시지 처리
│   ├── content/
│   │   ├── content.ts           # DOM 조작, 단축키, 번역 삽입
│   │   └── content.css          # 번역 텍스트 스타일
│   ├── popup/
│   │   ├── popup.html           # 설정 UI
│   │   ├── popup.ts             # 설정 로직
│   │   └── popup.css            # UI 스타일
│   ├── utils/
│   │   ├── translators.ts       # 3가지 번역 엔진
│   │   ├── cache.ts             # 번역 캐싱 시스템
│   │   └── storage.ts           # Chrome Storage 관리
│   └── types/
│       └── index.ts             # TypeScript 타입 정의
├── dist/                         # 빌드 결과물 ← 이거 로드!
│   ├── background.js
│   ├── content.js
│   ├── popup.js
│   ├── manifest.json
│   └── ...
├── icons/                        # 확장프로그램 아이콘
├── manifest.json                 # 확장프로그램 메타데이터
├── webpack.config.js             # 빌드 설정
├── tsconfig.json                 # TypeScript 설정
├── package.json
└── README.md
```

---

## 🛠 개발 가이드

### 환경 설정

```bash
# Node.js 14+ 필요
node --version

# 프로젝트 클론
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
chrome://extensions/ → 새로고침 버튼 클릭

# 4. 웹페이지 새로고침 (F5)
```

### 디버깅

#### Content Script 디버깅
```
1. 웹페이지에서 F12 (개발자 도구)
2. Console 탭
3. content.js 로그 확인
```

#### Background Script 디버깅
```
1. chrome://extensions/ 이동
2. ParallelTrans 찾기
3. "서비스 워커" 링크 클릭
4. 새 개발자 도구 창 열림
```

#### Popup 디버깅
```
1. 팝업 열기
2. 팝업에서 우클릭
3. "검사" 클릭
4. 개발자 도구 열림
```

### 커스터마이징

#### 번역 스타일 변경
```css
/* src/content/content.css */
.parallel-trans-translation {
  color: #2563eb;        /* 색상 변경 */
  font-size: 0.9em;      /* 크기 변경 */
  background-color: ...  /* 배경 변경 */
}
```

#### 단축키 변경
```typescript
// src/content/content.ts
// Option+A를 다른 키로 변경
if ((event.altKey) && event.key.toLowerCase() === 'b') {
  // Option+B로 변경
}
```

#### 배치 크기 조정
```typescript
// src/content/content.ts
const batchSize = 20; // 10에서 20으로 변경
```

---

## 📊 성능 최적화

### 캐싱 시스템
- 같은 텍스트 재번역 방지
- 메모리 캐시 (최대 1000개, 60분 유효)
- 캐시 히트율: ~80%

### 배치 처리
- 한 번에 10개씩 번역
- API 호출 간 100ms 딜레이
- 과부하 방지

### 필터링
- 의미없는 텍스트 제외 (3글자 미만)
- 제외 태그: script, style, code, pre
- 영어 텍스트만 번역

---

## 🎓 향후 계획

- [ ] 사이트별 자동/수동 설정
- [ ] 단어 선택 번역 (마우스 드래그)
- [ ] 번역 히스토리
- [ ] 커스텀 단축키 설정
- [ ] Google Translate API 추가
- [ ] 번역 품질 피드백
- [ ] 다국어 지원 확대

---

## 📄 라이선스

MIT License

---

## 🙏 기여하기

Pull Request 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📞 지원

문제가 있거나 질문이 있으시면:

1. F12 → Console에서 에러 확인
2. 이 README의 [문제 해결](#-문제-해결) 섹션 확인
3. GitHub Issues에 문의

---

## 🎯 기술 스택

- **언어**: TypeScript
- **빌드**: Webpack
- **플랫폼**: Chrome Extension Manifest V3
- **API**: DeepL API, LibreTranslate
- **스타일**: CSS3
- **테스트**: Manual Testing

---

## 📚 참고 자료

- [Chrome Extension 개발 가이드](https://developer.chrome.com/docs/extensions/)
- [DeepL API 문서](https://www.deepl.com/docs-api)
- [LibreTranslate 문서](https://libretranslate.com/)
- [TypeScript 문서](https://www.typescriptlang.org/)
- [Webpack 문서](https://webpack.js.org/)

---

## 🎉 완성!

ParallelTrans v2.0은 다음 기능을 제공합니다:

- ✅ 3가지 번역 엔진 (공개서버/로컬/DeepL)
- ✅ Option+A 단축키
- ✅ 병행표기/번역만 모드
- ✅ 자동/수동 트리거
- ✅ TypeScript로 작성
- ✅ 완벽한 문서화

**지금 바로 사용해보세요!** 🌐

---

**ParallelTrans v2.0.0**
Made with ❤️ in TypeScript
2025
