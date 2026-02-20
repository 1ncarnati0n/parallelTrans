import { CacheEntry, CacheStats, TranslationEngine, ApiError, ApiErrorCategory, CONSTANTS } from './types';

// ============== 공통 유틸리티 ==============
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 에러 객체에서 메시지 추출
 */
export function extractErrorMessage(error: unknown, defaultMessage = 'Unknown error'): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    if (typeof errObj.message === 'string') {
      return errObj.message;
    }
  }
  return defaultMessage;
}

// ============== 로깅 ==============
export const Logger = {
  debug: (tag: string, message: string, data?: unknown): void => {
    console.log(`[${tag}] ${message}`, data ?? '');
  },
  info: (tag: string, message: string, data?: unknown): void => {
    console.log(`[${tag}] ℹ ${message}`, data ?? '');
  },
  warn: (tag: string, message: string, data?: unknown): void => {
    console.warn(`[${tag}] ⚠ ${message}`, data ?? '');
  },
  error: (tag: string, message: string, error?: unknown): void => {
    console.error(`[${tag}] ❌ ${message}`, error ?? '');
  },
};

// ============== API 오류 진단 ==============
/**
 * HTTP 상태 코드로부터 오류 카테고리 판별
 */
export function categorizeApiError(status: number, errorMessage?: string): { category: ApiErrorCategory; isRetryable: boolean } {
  // 네트워크 오류 (fetch 실패 시 status가 0)
  if (status === 0) {
    return { category: 'NETWORK', isRetryable: true };
  }

  // 인증 오류
  if (status === 401 || status === 403) {
    // API 키 관련 메시지 확인
    const msg = (errorMessage || '').toLowerCase();
    if (msg.includes('key') || msg.includes('auth') || msg.includes('invalid')) {
      return { category: 'INVALID_KEY', isRetryable: false };
    }
    return { category: 'AUTH', isRetryable: false };
  }

  // 할당량 초과
  if (status === 429 || status === 456) {
    return { category: 'QUOTA', isRetryable: true };
  }

  // 요청 속도 제한 (Too Many Requests)
  if (status === 429) {
    return { category: 'RATE_LIMIT', isRetryable: true };
  }

  // 서버 오류
  if (status >= 500 && status < 600) {
    return { category: 'SERVER', isRetryable: true };
  }

  // 클라이언트 오류 (4xx) - 일반적으로 재시도 불가
  if (status >= 400 && status < 500) {
    return { category: 'UNKNOWN', isRetryable: false };
  }

  return { category: 'UNKNOWN', isRetryable: true };
}

/**
 * API 오류 객체 생성 헬퍼
 */
export function createApiError(
  status: number,
  message: string,
  engine: TranslationEngine,
  details?: unknown
): ApiError {
  const { category, isRetryable } = categorizeApiError(status, message);
  return {
    status,
    message,
    engine,
    category,
    isRetryable,
    details,
    timestamp: Date.now(),
  };
}

/**
 * API 오류 진단 메시지 생성
 */
export function diagnoseApiError(error: ApiError): string {
  const categoryMessages: Record<ApiErrorCategory, string> = {
    'NETWORK': '🌐 네트워크 연결 오류 - 인터넷 연결을 확인하세요.',
    'AUTH': '🔑 인증 오류 - API 키를 확인하세요.',
    'INVALID_KEY': '🔑 잘못된 API 키 - 설정에서 API 키를 다시 확인하세요.',
    'QUOTA': '📊 할당량 초과 - API 사용량 한도에 도달했습니다.',
    'RATE_LIMIT': '⏱️ 요청 속도 제한 - 잠시 후 다시 시도하세요.',
    'SERVER': '🖥️ 서버 오류 - 번역 서비스에 일시적인 문제가 있습니다.',
    'UNKNOWN': '❓ 알 수 없는 오류',
  };

  const baseMessage = categoryMessages[error.category];
  const retryInfo = error.isRetryable ? ' (재시도 가능)' : ' (재시도 불가)';

  return `[${error.engine.toUpperCase()}] ${baseMessage}${retryInfo}\n상태 코드: ${error.status}\n상세: ${error.message}`;
}

/**
 * API 문제인지 확인
 */
export function isApiRelatedError(error: unknown): error is ApiError {
  if (typeof error !== 'object' || error === null) return false;
  const err = error as Record<string, unknown>;
  return typeof err.status === 'number' &&
    typeof err.engine === 'string' &&
    typeof err.category === 'string';
}

/**
 * LRU 캐시 구현
 * - 최대 크기 제한
 * - TTL 지원
 * - LRU eviction 전략
 */
export class TranslationCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = CONSTANTS.CACHE_MAX_SIZE;
  private maxAge = CONSTANTS.CACHE_TTL_MS;
  private stats = { totalRequests: 0, cachedRequests: 0 };

  private getCacheKey(text: string, sourceLang: string, targetLang: string, engine?: TranslationEngine): string {
    // 엔진 정보도 포함하여 동일 텍스트의 다른 엔진 번역 결과 구분
    const enginePrefix = engine ? `${engine}:` : '';
    return `${enginePrefix}${sourceLang}:${targetLang}:${text}`;
  }

  async get(text: string, sourceLang: string, targetLang: string, engine?: TranslationEngine): Promise<CacheEntry | null> {
    this.stats.totalRequests++;
    // 엔진별로 캐시 조회 시도 (엔진 없으면 모든 엔진 검색)
    if (engine) {
      const key = this.getCacheKey(text, sourceLang, targetLang, engine);
      const entry = this.cache.get(key);
      if (entry) {
        // TTL 체크
        if (Date.now() - entry.timestamp > this.maxAge) {
          this.cache.delete(key);
          return null;
        }
        // LRU: 최근 사용 항목으로 이동
        this.cache.delete(key);
        this.cache.set(key, entry);
        this.stats.cachedRequests++;
        return entry;
      }
    } else {
      // 엔진이 지정되지 않으면 모든 엔진 검색
      for (const eng of ['deepl', 'groq-llm'] as TranslationEngine[]) {
        const key = this.getCacheKey(text, sourceLang, targetLang, eng);
        const entry = this.cache.get(key);
        if (entry && Date.now() - entry.timestamp <= this.maxAge) {
          // LRU: 최근 사용 항목으로 이동
          this.cache.delete(key);
          this.cache.set(key, entry);
          this.stats.cachedRequests++;
          return entry;
        }
      }
    }

    return null;

  }

  async set(text: string, translation: string, sourceLang: string, targetLang: string, engine: TranslationEngine): Promise<void> {
    const key = this.getCacheKey(text, sourceLang, targetLang, engine);

    // LRU eviction: 가장 오래된 항목 제거
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, { translation, engine, timestamp: Date.now() });
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { totalRequests: 0, cachedRequests: 0 };
  }

  getStats(): CacheStats {
    const hitRate = this.stats.totalRequests > 0
      ? (this.stats.cachedRequests / this.stats.totalRequests) * 100
      : 0;

    return {
      memorySize: this.cache.size,
      hitRate: parseFloat(hitRate.toFixed(2)),
      totalRequests: this.stats.totalRequests,
      cachedRequests: this.stats.cachedRequests,
    };
  }
}

// ============== 레이트 제한 ==============
/**
 * API 호출 속도 제한
 * - DeepL: 100ms 간격 (Free API 제한)
 * - Groq LLM: 200ms 간격 (API 레이트 리밋 고려)
 */
export class RateLimiter {
  private lastRequestTime: Record<TranslationEngine, number> = {
    'deepl': 0,
    'groq-llm': 0,
  };

  private minInterval: Record<TranslationEngine, number> = {
    'deepl': CONSTANTS.RATE_LIMIT_DEEPL,
    'groq-llm': CONSTANTS.RATE_LIMIT_GROQ,
  };

  async waitForSlot(engine: TranslationEngine): Promise<void> {
    const now = Date.now();
    const lastTime = this.lastRequestTime[engine];
    const timeSinceLastRequest = now - lastTime;
    const minInterval = this.minInterval[engine];

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      Logger.debug('RateLimiter', `${engine} 대기: ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime[engine] = Date.now();
  }

  async waitForBatch(engine: TranslationEngine, _totalChars: number): Promise<void> {
    await this.waitForSlot(engine);
  }
}

// ============== Storage ==============
export class StorageManager {
  async get<T>(key: string): Promise<T | null> {
    return new Promise(resolve => {
      chrome.storage.sync.get(key, result => {
        if (chrome.runtime.lastError) {
          Logger.error('Storage', `Get failed: ${chrome.runtime.lastError.message}`);
          resolve(null);
        } else {
          resolve((result[key] as T) ?? null);
        }
      });
    });
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    return new Promise(resolve => {
      chrome.storage.sync.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          Logger.error('Storage', `Set failed: ${chrome.runtime.lastError.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
}
