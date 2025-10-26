import { CacheEntry, TranslationEngine, PerformanceMetrics } from '../types';
import { Logger } from './logger';

/**
 * 고급 번역 캐시 매니저
 * - 메모리 기반 캐시 (빠름)
 * - IndexedDB 영구 캐시 (확장성)
 * - LRU 제거 정책
 * - 성능 메트릭스 추적
 */
export class TranslationCache {
  private memoryCache: Map<string, CacheEntry>;
  private maxMemorySize: number;
  private maxAge: number; // milliseconds
  private metrics: PerformanceMetrics;
  private dbName = 'ParallelTransDB';
  private dbVersion = 1;
  private storeName = 'translations';

  constructor(maxMemorySize: number = 2000, maxAgeMinutes: number = 60) {
    this.memoryCache = new Map();
    this.maxMemorySize = maxMemorySize;
    this.maxAge = maxAgeMinutes * 60 * 1000;
    this.metrics = {
      totalRequests: 0,
      cachedRequests: 0,
      averageResponseTime: 0,
      totalCharactersTranslated: 0,
      apiUsage: {
        deepl: 0,
        microsoft: 0,
      },
    };

    this.initializeDB();
  }

  /**
   * IndexedDB 초기화
   */
  private async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        Logger.warn('Cache', 'Failed to initialize IndexedDB');
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('engine', 'engine', { unique: false });
        }
      };
    });
  }

  /**
   * 캐시 키 생성
   */
  private getCacheKey(text: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}:${targetLang}:${text}`;
  }

  /**
   * 메모리 캐시에서 조회
   */
  private getFromMemory(key: string): CacheEntry | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    // 만료 확인
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * IndexedDB에서 조회
   */
  private async getFromDB(key: string): Promise<CacheEntry | null> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction([this.storeName], 'readonly');
          const store = transaction.objectStore(this.storeName);
          const getRequest = store.get(key);

          getRequest.onsuccess = () => {
            const entry = getRequest.result;
            if (entry && Date.now() - entry.timestamp > this.maxAge) {
              // 만료된 엔트리 삭제
              const deleteRequest = store.delete(key);
              deleteRequest.onsuccess = () => resolve(null);
              deleteRequest.onerror = () => resolve(null);
            } else {
              resolve(entry || null);
            }
          };

          getRequest.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      } catch (error) {
        Logger.debug('Cache', 'IndexedDB query failed, using memory cache');
        resolve(null);
      }
    });
  }

  /**
   * 캐시에서 번역 조회
   * 1. 메모리 캐시 확인
   * 2. IndexedDB 확인
   * 3. 찾은 항목을 메모리에 로드
   */
  async get(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<{ translation: string; engine: TranslationEngine } | null> {
    const key = this.getCacheKey(text, sourceLang, targetLang);
    this.metrics.totalRequests++;

    // 메모리 캐시 확인
    const memEntry = this.getFromMemory(key);
    if (memEntry) {
      this.metrics.cachedRequests++;
      Logger.debug('Cache', `Hit (memory): ${text.substring(0, 30)}...`);
      return { translation: memEntry.translation, engine: memEntry.engine };
    }

    // IndexedDB 확인
    const dbEntry = await this.getFromDB(key);
    if (dbEntry) {
      this.metrics.cachedRequests++;
      // 메모리에 로드
      this.memoryCache.set(key, dbEntry);
      Logger.debug('Cache', `Hit (db): ${text.substring(0, 30)}...`);
      return { translation: dbEntry.translation, engine: dbEntry.engine };
    }

    Logger.debug('Cache', `Miss: ${text.substring(0, 30)}...`);
    return null;
  }

  /**
   * 캐시에 번역 저장
   */
  async set(
    text: string,
    translation: string,
    sourceLang: string,
    targetLang: string,
    engine: TranslationEngine
  ): Promise<void> {
    const key = this.getCacheKey(text, sourceLang, targetLang);
    const entry: CacheEntry = {
      text,
      translation,
      timestamp: Date.now(),
      engine,
    };

    // 메모리 캐시에 저장
    if (this.memoryCache.size >= this.maxMemorySize) {
      // LRU: 가장 오래된 항목 제거
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }
    this.memoryCache.set(key, entry);

    // IndexedDB에 저장 (비동기)
    try {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const dbEntry = { key, ...entry };
        store.put(dbEntry);
      };
    } catch (error) {
      Logger.debug('Cache', 'Failed to save to IndexedDB');
    }

    // 메트릭 업데이트
    this.metrics.totalCharactersTranslated += text.length;
  }

  /**
   * 배치 조회
   */
  async getBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): Promise<Map<string, { translation: string; engine: TranslationEngine } | null>> {
    const results = new Map();

    for (const text of texts) {
      const result = await this.get(text, sourceLang, targetLang);
      results.set(text, result);
    }

    return results;
  }

  /**
   * 배치 저장
   */
  async setBatch(
    items: Array<{
      text: string;
      translation: string;
      sourceLang: string;
      targetLang: string;
      engine: TranslationEngine;
    }>
  ): Promise<void> {
    for (const item of items) {
      await this.set(item.text, item.translation, item.sourceLang, item.targetLang, item.engine);
    }
  }

  /**
   * 캐시 초기화
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();

    try {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        store.clear();
      };
    } catch (error) {
      Logger.debug('Cache', 'Failed to clear IndexedDB');
    }

    Logger.info('Cache', 'Cache cleared');
  }

  /**
   * 캐시 통계
   */
  getStats(): {
    memorySize: number;
    hitRate: number;
    totalRequests: number;
    cachedRequests: number;
  } {
    const hitRate = this.metrics.totalRequests > 0
      ? (this.metrics.cachedRequests / this.metrics.totalRequests) * 100
      : 0;

    return {
      memorySize: this.memoryCache.size,
      hitRate: parseFloat(hitRate.toFixed(2)),
      totalRequests: this.metrics.totalRequests,
      cachedRequests: this.metrics.cachedRequests,
    };
  }

  /**
   * 만료된 캐시 정리
   */
  async cleanup(): Promise<void> {
    const now = Date.now();

    // 메모리 캐시 정리
    for (const [key, entry] of this.memoryCache) {
      if (now - entry.timestamp > this.maxAge) {
        this.memoryCache.delete(key);
      }
    }

    // IndexedDB 정리
    try {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('timestamp');

        const range = IDBKeyRange.upperBound(now - this.maxAge);
        const deleteRequest = index.openCursor(range);

        deleteRequest.onsuccess = (event: any) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      };
    } catch (error) {
      Logger.debug('Cache', 'Failed to cleanup IndexedDB');
    }

    Logger.debug('Cache', 'Cache cleanup completed');
  }

  /**
   * 메트릭 조회
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}
