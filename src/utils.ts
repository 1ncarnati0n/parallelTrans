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
import { CacheEntry, CacheStats } from './types';

export class TranslationCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 2000;
  private maxAge = 60 * 60 * 1000; // 1시간
  private stats = { totalRequests: 0, cachedRequests: 0 };

  private getCacheKey(text: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}:${targetLang}:${text}`;
  }

  async get(text: string, sourceLang: string, targetLang: string): Promise<CacheEntry | null> {
    this.stats.totalRequests++;
    const key = this.getCacheKey(text, sourceLang, targetLang);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    this.stats.cachedRequests++;
    return entry;
  }

  async set(text: string, translation: string, sourceLang: string, targetLang: string, engine: any): Promise<void> {
    const key = this.getCacheKey(text, sourceLang, targetLang);

    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, { translation, engine, timestamp: Date.now() });
  }

  async clear(): Promise<void> {
    this.cache.clear();
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
export class RateLimiter {
  // 요청 큐 및 타이밍 추적
  private lastRequestTime = { deepl: 0, microsoft: 0 };
  private requestQueue = { deepl: 0, microsoft: 0 };

  // API 제한
  // DeepL Free: 50만 자/월, 약 50 requests/분
  // Microsoft: 1초당 100 요청 (약 1000 TPS)
  private minInterval = { deepl: 1200, microsoft: 100 }; // ms 단위 최소 간격

  async waitForSlot(engine: 'deepl' | 'microsoft'): Promise<void> {
    const now = Date.now();
    const lastTime = this.lastRequestTime[engine];
    const timeSinceLastRequest = now - lastTime;
    const minInterval = this.minInterval[engine];

    if (timeSinceLastRequest < minInterval) {
      // 최소 간격 미달 시 대기
      const waitTime = minInterval - timeSinceLastRequest;
      console.log(`[RateLimiter] ${engine} 대기: ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime[engine] = Date.now();
  }

  // 배치 요청의 경우 추가 체크 (문자 수 기반)
  async waitForBatch(engine: 'deepl' | 'microsoft', totalChars: number): Promise<void> {
    // 먼저 기본 레이트 제한 적용
    await this.waitForSlot(engine);

    // Microsoft의 경우 추가 제한 (1초당 100K 문자)
    if (engine === 'microsoft' && totalChars > 1000) {
      // 너무 큰 배치는 추가 대기
      const extraWait = Math.max(0, totalChars / 10000 * 100);
      if (extraWait > 0) {
        console.log(`[RateLimiter] Microsoft 배치 크기로 인한 추가 대기: ${extraWait}ms`);
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
