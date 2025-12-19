/**
 * Utility Functions
 */

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

// ============== 캐시 ==============
import { CacheEntry, CacheStats, TranslationEngine, CONSTANTS } from './types';

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
      for (const eng of ['deepl', 'microsoft'] as TranslationEngine[]) {
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
 * - DeepL Free: 50만 자/월, 약 50 requests/분
 * - Microsoft: 1초당 100 요청
 */
export class RateLimiter {
  private lastRequestTime = { deepl: 0, microsoft: 0 };
  private minInterval = {
    deepl: CONSTANTS.RATE_LIMIT_DEEPL,
    microsoft: CONSTANTS.RATE_LIMIT_MICROSOFT
  };

  async waitForSlot(engine: 'deepl' | 'microsoft'): Promise<void> {
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

  async waitForBatch(engine: 'deepl' | 'microsoft', totalChars: number): Promise<void> {
    await this.waitForSlot(engine);

    // Microsoft의 경우 추가 제한 (1초당 100K 문자)
    if (engine === 'microsoft' && totalChars > 1000) {
      const extraWait = Math.max(0, totalChars / 10000 * 100);
      if (extraWait > 0) {
        Logger.debug('RateLimiter', `Microsoft 배치 크기로 인한 추가 대기: ${extraWait}ms`);
        await new Promise(resolve => setTimeout(resolve, extraWait));
      }
    }
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
