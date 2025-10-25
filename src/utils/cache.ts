import { CacheEntry } from '../types';

/**
 * 번역 캐시 매니저
 * 같은 텍스트를 반복 번역하지 않도록 캐싱
 */
export class TranslationCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private maxAge: number; // milliseconds

  constructor(maxSize: number = 1000, maxAgeMinutes: number = 60) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxAge = maxAgeMinutes * 60 * 1000;
  }

  /**
   * 캐시 키 생성
   */
  private getCacheKey(text: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}:${targetLang}:${text}`;
  }

  /**
   * 캐시에서 번역 가져오기
   */
  get(text: string, sourceLang: string, targetLang: string): string | null {
    const key = this.getCacheKey(text, sourceLang, targetLang);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // 만료된 캐시 삭제
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.translation;
  }

  /**
   * 캐시에 번역 저장
   */
  set(text: string, translation: string, sourceLang: string, targetLang: string): void {
    const key = this.getCacheKey(text, sourceLang, targetLang);

    // 캐시 크기 제한 확인
    if (this.cache.size >= this.maxSize) {
      // 가장 오래된 항목 삭제
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      text,
      translation,
      timestamp: Date.now()
    });
  }

  /**
   * 캐시 초기화
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 캐시 크기 반환
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 만료된 캐시 정리
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
  }
}
