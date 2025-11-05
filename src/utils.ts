/**
 * Utility Functions
 */

// ============== 로깅 ==============
export const Logger = {
  debug: (tag: string, message: string, data?: any) => {
    console.log(`[${tag}] ${message}`, data || '');
  },
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${tag}] ℹ ${message}`, data || '');
  },
  warn: (tag: string, message: string, data?: any) => {
    console.warn(`[${tag}] ⚠ ${message}`, data || '');
  },
  error: (tag: string, message: string, error?: any) => {
    console.error(`[${tag}] ❌ ${message}`, error || '');
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

  private getCacheKey(text: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}:${targetLang}:${text}`;
  }

  async get(text: string, sourceLang: string, targetLang: string): Promise<CacheEntry | null> {
    this.stats.totalRequests++;
    const key = this.getCacheKey(text, sourceLang, targetLang);
    const entry = this.cache.get(key);

    if (!entry) return null;

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

  async set(text: string, translation: string, sourceLang: string, targetLang: string, engine: TranslationEngine): Promise<void> {
    const key = this.getCacheKey(text, sourceLang, targetLang);

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
  async get(key: string): Promise<any> {
    return new Promise(resolve => {
      chrome.storage.sync.get(key, result => {
        resolve(result[key]);
      });
    });
  }

  async set(key: string, value: any): Promise<void> {
    return new Promise(resolve => {
      chrome.storage.sync.set({ [key]: value }, resolve);
    });
  }
}
