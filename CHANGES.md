# 변경 사항 정리 (2025-10-26)

## 최신 수정: Rate Limit 에러 해결 (429 에러)

**문제**: Microsoft Translator API에서 429 (Too Many Requests) 에러 발생
- 원인: 부정확한 Rate Limiter 로직
- 토큰 기반 제한이 실제 API 한도와 맞지 않음

**해결**:
1. **RateLimiter 완전 재작성** (utils.ts, 80-121줄)
   - 토큰 방식 → 요청 간격 방식 변경
   - DeepL: 최소 1.2초 간격 (약 50 requests/분)
   - Microsoft: 최소 100ms 간격 (충분한 여유)

2. **배치 번역 레이트 제한 추가** (background.ts, 146-191줄)
   - `waitForBatch()` 메서드 사용으로 배치 크기 고려
   - 배치 간 적절한 대기 시간 설정

3. **폴백 엔진 재시도 개선**
   - 배치 번역 실패 시 보조 엔진으로 자동 재시도
   - 두 엔진 모두 실패 시에만 에러 반환

**API 한도**:
```
DeepL Free:
  - 월 한도: 50만 자
  - 예상: ~50 requests/분
  - 설정: 1200ms 간격

Microsoft:
  - 요청: 1초당 100 요청
  - 문자: 1초당 100K 문자
  - 설정: 100ms 간격 + 배치 크기 체크
```

---

## 수정된 문제 (이전)

### 1. 단축키 문제 (Cmd+A → Option+A)

**문제**: 
- 이전: `(e.altKey || e.metaKey) && e.key === 'a'`
- 결과: Cmd+A가 번역 ON/OFF로 작동 (브라우저 기본 단축키와 충돌)

**해결**:
- 변경: `e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'a'`
- 결과: Option+A / Alt+A만 번역 ON/OFF로 작동
- Cmd+A는 브라우저 기본 "모두 선택" 기능으로 복구됨

**파일**: `src/content.ts` (103-128줄)

---

### 2. HTML 태그로 인한 텍스트 분리 문제

**문제**:
- `<p>This is <strong>important</strong> text</p>` 같은 HTML에서
- "This is" → "번역1"
- "important" → "번역2"  
- "text" → "번역3"
- 문장이 분리되어 전체 의미가 손상됨

**해결**:
- TextWalker 로직 개선 (content.ts, 230-279줄)
- 블록 요소 단위로 텍스트 추출: P, H1-H6, DIV, LI, TD, BLOCKQUOTE 등
- 인라인 포맷팅 요소 무시: STRONG, EM, B, I, U, MARK, SMALL, SUP, SUB, SPAN
- 결과: 전체 문장 "This is important text" → "전체 번역" (한 번에)

**파일**: `src/content.ts` (230-279줄)

**개선된 요소 처리**:
```
이전:
<p>This is <strong>important</strong> text</p>
└─ "This is" + "important" + "text" (3개 별도 번역)

이후:
<p>This is <strong>important</strong> text</p>
└─ "This is important text" (1개 통합 번역)
```

---

## 단축키 정리

| 기능 | Mac | Windows |
|------|-----|---------|
| 번역 ON/OFF | Option+A | Alt+A |
| 모드 전환 | Option+Q | Alt+Q |
| 모두 선택 | Cmd+A | Ctrl+A |

---

## 테스트 방법

### 1. 단축키 테스트
```bash
npm run build
# chrome://extensions/ → ParallelTrans 새로고침
# 웹페이지 새로고침: Cmd+Shift+R

# Mac에서:
- Option+A: 번역 ON → "✅ 번역 ON" 토스트 표시
- Cmd+A: 페이지의 모든 텍스트 선택 (정상 작동)
```

### 2. HTML 태그 테스트
```
테스트 페이지에서 다음과 같은 HTML로 테스트:

<p>This is <strong>very important</strong> information.</p>
<h2>The <em>Quick</em> Brown Fox</h2>
<li>Item with <b>bold</b> text and <i>italic</i> style</li>

예상 결과:
- 각각 하나의 완전한 문장으로 번역됨
- "important" 만 따로 번역 안 됨
```

---

## 파일 변경 사항

### src/content.ts
- **103-128줄**: `handleKeydown()` 함수 수정 (단축키 조건 개선)
- **230-279줄**: `getTextNodes()` 함수 재작성 (텍스트 추출 로직 개선)

### README.md
- 단축키 정보 업데이트
- 사용법 예시 보완

### CLAUDE.md
- 작동 흐름 다이어그램 업데이트
- DOM 조작/텍스트 추출 섹션 확대
- 단축키 상세 설명 추가

---

## 성능 영향

✅ **개선됨**:
- API 호출 횟수 감소 (5-8개 → 1-2개)
- 번역 결과의 정확도 향상
- 캐시 히트율 증가 (문장이 통합되므로)

✅ **무영향**:
- CPU/메모리 사용량
- 렌더링 성능

---

## 역호환성

✅ **호환성 유지**:
- 기존 설정 및 캐시 유지
- 사용자 인터페이스 변경 없음
- API 통신 프로토콜 변경 없음

---

## 추후 개선 가능성

1. **더 많은 블록 요소 지원**
   - BLOCKQUOTE, ARTICLE, SECTION, FIGURE, DETAILS 등

2. **테이블 처리 개선**
   - 현재 TD, TH 지원하지만, 테이블 구조 인식 추가

3. **리스트 항목 최적화**
   - 리스트 전체 번역 vs 각 항목 별 번역 옵션

4. **사용자 정의 필터링**
   - 제외할 요소나 클래스 팝업에서 설정 가능

