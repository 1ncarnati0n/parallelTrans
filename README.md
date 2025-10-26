# ParallelTrans - 실시간 번역 Chrome 확장프로그램

영어 웹페이지를 **Option+A (Mac) / Alt+A (Windows)** 단축키로 한국어로 병렬 번역하는 Chrome 확장프로그램입니다.

- **버전**: 2.0
- **언어**: TypeScript 5.3
- **빌드**: Webpack 5
- **아키텍처**: 간단하고 모듈화된 구조

---

## 핵심 기능

✅ **Option+A / Alt+A 단축키** - 언제든 빠르게 번역
✅ **병렬 표기** - 원문과 번역을 함께 표시
✅ **캐싱 시스템** - 중복 번역 방지 (80% 히트율)
✅ **배치 처리** - 한 번에 여러 텍스트 번역
✅ **속도 제한** - API 할당량 관리 (엔진별)
✅ **폴백 엔진** - 주 엔진 실패 시 자동 전환

---

## 설치 및 빌드

### 1. 의존성 설치
```bash
npm install
```

### 2. 빌드
```bash
# 프로덕션 빌드
npm run build

# 개발 모드 (감시 모드)
npm run dev

# 빌드 폴더 정리
npm run clean
```

### 3. Chrome에 로드
1. `chrome://extensions/` 접속
2. **개발자 모드** 활성화 (우측 상단)
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. `dist/` 폴더 선택

---

## 사용 방법

### 기본 사용법

1. 영어 웹페이지 접속
2. **Option+A** (Mac) 또는 **Alt+A** (Windows) 입력 - 번역 ON/OFF 토글
3. **Option+Q** (Mac) 또는 **Alt+Q** (Windows) - 표시 모드 전환 (병렬 표기 ↔ 번역만)
4. 페이지의 모든 텍스트가 번역됨
5. 원문과 번역이 설정된 모드에 따라 표시됨

### 결과 예시
```
원문: "Hello World is important"
병렬 표기: "Hello World is important [안녕하세요 세계는 중요합니다]"
번역만: "안녕하세요 세계는 중요합니다"
```

### 주의사항
- **Cmd+A (Mac)**: 모두 선택 (번역 ON/OFF 아님, 수정됨)
- **Alt+A (Windows)**: 번역 ON/OFF 토글 (이전과 동일)
- **HTML 태그 내 텍스트**: 이제 전체 문장으로 번역됨 (예: `<strong>important</strong>`는 더 이상 따로 번역 안 됨)

### 설정

확장프로그램 팝업에서 다음을 설정할 수 있습니다:

- **주 번역 엔진**: DeepL 또는 Microsoft
- **보조 번역 엔진**: 주 엔진 실패 시 사용
- **API 키**: 선택한 엔진의 API 키
- **언어**: 소스 & 타겟 언어 (EN, KO, JA, ZH, ES, FR, DE)
- **표시 모드**: 병렬 표기 또는 번역만
- **배치 크기**: API 요청당 텍스트 수 (기본값: 10)

---

## 번역 엔진

### DeepL
- **특징**: 최고 품질 번역
- **무료 한도**: 50만 자/월
- **API 키 발급**: https://www.deepl.com/pro-api

### Microsoft Translator
- **특징**: 안정적인 번역
- **무료 한도**: 200만 자/월
- **API 키 발급**: https://azure.microsoft.com/services/cognitive-services/translator/

---

## 프로젝트 구조

```
src/
├── background.ts          # Service Worker - 메시지 라우팅, 번역 처리
├── content.ts             # Content Script - DOM 조작, 텍스트 추출
├── popup.ts               # Popup UI 로직
├── popup.html             # 설정 UI
├── content.css            # 번역 텍스트 스타일
├── translators.ts         # DeepL, Microsoft 구현
├── types.ts               # 타입 정의
└── utils.ts               # 캐시, 속도 제한, 로깅, 저장소

dist/                      # 빌드 결과 (Chrome에 로드)
```

---

## 개발 워크플로우

### 코드 수정 후 테스트

```bash
# 1. 코드 수정
# 2. 빌드
npm run build

# 3. Chrome에서 새로고침
chrome://extensions/ → ParallelTrans → 새로고침 버튼

# 4. 웹페이지 새로고침
Cmd+Shift+R (Mac) 또는 Ctrl+Shift+R (Windows)
```

### 디버깅

**Content Script (DOM 조작)**
- 웹페이지에서 F12 개발자도구 열기
- Console 탭에서 로그 확인

**Service Worker (번역 로직)**
- `chrome://extensions/` 접속
- ParallelTrans → "서비스 워커" 링크 클릭
- 개발자도구에서 로그 확인

**Popup 설정 UI**
- 팝업에서 우클릭 → "검사"

---

## 기술 스택

| 항목 | 기술 |
|------|------|
| 언어 | TypeScript 5.3 |
| 빌드 | Webpack 5 |
| 플랫폼 | Chrome Extension (Manifest V3) |
| 번역 API | DeepL, Microsoft Translator |
| 스타일 | CSS (Tailwind) |

---

## 성능 최적화

- **캐싱**: 메모리 기반, 최대 2000개 항목, 1시간 TTL
- **배치 처리**: 한 번에 10개 텍스트까지 그룹화
- **속도 제한**: DeepL 5회/시간, Microsoft 200회/시간
- **텍스트 필터링**: 3글자 미만 텍스트 제외
- **디바운싱**: 100ms 딜레이로 배치 처리 최적화

---

## 문제 해결

### 번역이 안 됨

**원인 및 해결**:
1. API 키가 올바른지 확인
2. 개발자도구 Console에서 에러 메시지 확인
3. 엔진의 무료 한도를 초과했는지 확인
4. 다른 엔진으로 변경 후 재시도

### 스타일이 적용 안 됨

```bash
# 1. 빌드
npm run build

# 2. 확장프로그램 새로고침
chrome://extensions/ → 새로고침 버튼

# 3. 웹페이지 강력 새로고침
Cmd+Shift+R (Mac) 또는 Ctrl+Shift+R (Windows)
```

---

## 라이선스

MIT License

---

**Made with TypeScript**
2025
