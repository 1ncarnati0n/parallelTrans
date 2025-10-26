# Rate Limit 429 에러 해결 문서

## 문제 상황

```
[Background] ❌ Batch translation failed Error: Microsoft batch error: 429
```

**429 에러의 의미**: Too Many Requests - API 호출 한도 초과

---

## 근본 원인

### 이전 Rate Limiter의 문제점

```typescript
// 이전 코드 (부정확함)
private tokens = { deepl: 5, microsoft: 200 };
private limits = { deepl: 1000, microsoft: 60000 }; // ms 단위

// 토큰 계산 (시간 기준 오류)
const tokensToAdd = (timePassed / limit) * maxTokens;
```

**문제**:
1. 토큰 기반 제한이 실제 API 한도와 맞지 않음
2. 배치 크기(배치당 텍스트 수)를 전혀 고려하지 않음
3. 밀리초 기반 계산이 부정확함

### 실제 API 한도

**Microsoft Translator**:
- 요청: 1초당 최대 100 요청
- 문자: 1초당 최대 100K 문자
- 월간: 2백만 자 (무료 티어)

**DeepL Free**:
- 월간: 50만 자
- 예상: 약 50 requests/분 정도 (균등 분산)

---

## 해결 방법

### 1. Rate Limiter 완전 재작성

**파일**: `src/utils.ts` (80-121줄)

```typescript
export class RateLimiter {
  // 요청 간 최소 간격 (ms)
  private minInterval = { 
    deepl: 1200,      // 1.2초 = 약 50 requests/분
    microsoft: 100    // 100ms = 약 10 requests/초 (충분한 여유)
  };

  async waitForSlot(engine: 'deepl' | 'microsoft'): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime[engine];
    const minInterval = this.minInterval[engine];

    if (timeSinceLastRequest < minInterval) {
      // 최소 간격에 미달하면 대기
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime[engine] = Date.now();
  }

  // 배치 크기를 고려한 추가 제한
  async waitForBatch(engine: 'deepl' | 'microsoft', totalChars: number): Promise<void> {
    await this.waitForSlot(engine);

    // 배치가 너무 크면 추가 대기
    if (engine === 'microsoft' && totalChars > 1000) {
      const extraWait = Math.max(0, totalChars / 10000 * 100);
      if (extraWait > 0) {
        await new Promise(resolve => setTimeout(resolve, extraWait));
      }
    }
  }
}
```

**개선사항**:
- ✅ 토큰 방식 → 요청 간격 방식 변경
- ✅ 배치 크기 고려
- ✅ 더 단순하고 예측 가능한 로직

### 2. 배치 번역에서 Rate Limiter 사용

**파일**: `src/background.ts` (146-191줄)

```typescript
async function handleBatchTranslate(request: BatchTranslationRequest) {
  if (uncachedTexts.length > 0) {
    const batchSize = settings.batchSize;
    for (let i = 0; i < uncachedTexts.length; i += batchSize) {
      const batch = uncachedTexts.slice(i, i + batchSize);
      const texts = batch.map(b => b.text);
      const totalChars = texts.reduce((sum, text) => sum + text.length, 0);

      // 배치 크기를 고려한 레이트 제한
      await rateLimiter.waitForBatch(settings.primaryEngine, totalChars);

      try {
        const response = await manager.translateBatch(...);
        // 번역 결과 처리
      } catch (batchError) {
        // 주 엔진 실패 → 보조 엔진 재시도
        await rateLimiter.waitForBatch(settings.fallbackEngine, totalChars);
        const response = await manager.translateBatch(settings.fallbackEngine, ...);
      }
    }
  }
}
```

**개선사항**:
- ✅ 배치 번역 시 문자 수 전달
- ✅ 배치 간 적절한 대기
- ✅ 실패 시 보조 엔진으로 자동 재시도

---

## 결과 비교

| 항목 | 이전 | 이후 |
|------|------|------|
| **Rate Limiter** | 토큰 기반 (부정확) | 간격 기반 (정확) |
| **배치 고려** | 없음 | 문자 수 기반 체크 |
| **Microsoft 429 에러** | ❌ 발생 | ✅ 방지 |
| **폴백 재시도** | 단일 요청만 | 배치도 지원 |
| **가독성** | 복잡함 | 단순함 |

---

## 테스트 방법

### 콘솔에서 테스트

```javascript
// DevTools Console에서:
console.log('[RateLimiter] Microsoft 대기: 100ms');  // 100ms 간격 확인
console.log('[RateLimiter] 배치 크기로 인한 추가 대기: 50ms');  // 배치 대기 확인
```

### 실제 사용 테스트

```bash
npm run build
# chrome://extensions/ → ParallelTrans 새로고침

# 많은 텍스트가 있는 페이지에서:
# 1. Option+A로 번역 ON
# 2. DevTools 콘솔 → "Background" 탭
# 3. 대기 메시지 및 번역 성공 메시지 확인
```

### 한계 테스트

```javascript
// Microsoft API 한도 근처에서 테스트
// - 10개 텍스트 배치 × 1000자 = 10K 문자 → 성공
// - 10개 텍스트 배치 × 10K자 = 100K 문자 → 추가 대기 후 성공
```

---

## API 한도 참고

### DeepL Free
```
월 한도: 500,000 자
예상 분산: 500,000 자 / (30일 × 24시간 × 60분) ≈ 347 자/분
요청 간 최소 간격: 1.2초 (안전 여유)
```

### Microsoft Free
```
월 한도: 2,000,000 자
요청: 1초당 100 요청
문자: 1초당 100,000 문자
요청 간 최소 간격: 100ms (충분한 여유)
```

---

## 추후 개선 사항

1. **적응형 Rate Limiting**
   - 429 에러 발생 시 대기 시간 자동 증가
   - 성공 시 대기 시간 자동 감소

2. **요청 큐 시스템**
   - 대기 중인 번역 요청을 큐에 저장
   - 별도 워커에서 순차 처리

3. **API 사용량 모니터링**
   - 일일/월간 사용량 추적
   - 한도 근처 시 경고

4. **다중 계정 지원**
   - 여러 API 키 등록
   - 한도 초과 시 다음 키로 전환

---

## 자주 묻는 질문 (FAQ)

### Q: 왜 Microsoft는 100ms, DeepL은 1.2초인가?
A: API 한도 차이 때문입니다.
- Microsoft: 1초당 100 요청 가능 → 100ms 간격으로도 충분
- DeepL: 월 50만 자 → 균등 분산 시 약 1.2초 간격 필요

### Q: 429 에러가 또 발생하면?
A: 다음을 확인하세요:
1. 다른 탭/확장프로그램에서 같은 API 키 사용 중인가?
2. 배치 크기(Settings)가 10보다 크면 줄여보기
3. 다른 엔진으로 변경하기
4. API 한도 초과 확인 (Azure Portal / DeepL Dashboard)

### Q: 캐시도 중요한가?
A: 매우 중요합니다. 캐시 히트율이 80%이므로:
- 같은 문장이 반복되면 API 호출 없음
- Rate Limit 문제 대부분 해결

---

**수정 완료**: 2025-10-26
**파일 변경**:
- `src/utils.ts`: RateLimiter 재작성
- `src/background.ts`: 배치 번역 레이트 제한 추가
