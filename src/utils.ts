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
  private tokens = { deepl: 5, microsoft: 200 };
  private lastRefill = { deepl: Date.now(), microsoft: Date.now() };
  private limits = { deepl: 1000, microsoft: 60000 }; // 시간 윈도우

  async waitForSlot(engine: 'deepl' | 'microsoft'): Promise<void> {
    const now = Date.now();
    const timePassed = now - this.lastRefill[engine];
    const limit = this.limits[engine];
    const maxTokens = engine === 'deepl' ? 5 : 200;

    // 토큰 리필
    if (timePassed >= limit) {
      this.tokens[engine] = maxTokens;
      this.lastRefill[engine] = now;
    }

    // 토큰 계산
    const tokensToAdd = (timePassed / limit) * maxTokens;
    this.tokens[engine] = Math.min(maxTokens, this.tokens[engine] + tokensToAdd);

    // 토큰이 없으면 대기
    if (this.tokens[engine] < 1) {
      const waitTime = (limit / maxTokens) * (1 - this.tokens[engine]);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.tokens[engine] = 1;
    } else {
      this.tokens[engine] -= 1;
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
