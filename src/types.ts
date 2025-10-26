/**
 * Core Type Definitions
 * Single source of truth for all types
 */

// ============== 번역 엔진 ==============
export type TranslationEngine = 'deepl' | 'microsoft';
export type DisplayMode = 'parallel' | 'translation-only';
export type TriggerMode = 'auto' | 'manual';

// ============== 번역 요청/응답 ==============
export interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
}

export interface BatchTranslationRequest {
  texts: string[];
  sourceLang: string;
  targetLang: string;
}

export interface TranslationResponse {
  translatedText: string;
  engine: TranslationEngine;
}

export interface BatchTranslationResponse {
  translations: string[];
  engine: TranslationEngine;
}

// ============== 설정 ==============
export interface Settings {
  enabled: boolean;
  deeplApiKey: string;
  deeplIsFree: boolean;
  microsoftApiKey: string;
  microsoftRegion: string;
  sourceLang: string;
  targetLang: string;
  primaryEngine: TranslationEngine;
  fallbackEngine: TranslationEngine;
  displayMode: DisplayMode;
  batchSize: number;
  cacheEnabled: boolean;
  viewportTranslation: boolean;
}

// ============== 캐시 ==============
export interface CacheEntry {
  translation: string;
  engine: TranslationEngine;
  timestamp: number;
}

// ============== 메시지 ==============
export type MessageType = 'translate' | 'batchTranslate' | 'getSettings' | 'updateSettings' | 'getCacheStats';

export interface Message {
  type: MessageType;
  data?: any;
}

export interface TranslationResult {
  success: boolean;
  translation?: string;
  translations?: string[];
  error?: string;
}

// ============== 캐시 통계 ==============
export interface CacheStats {
  memorySize: number;
  hitRate: number;
  totalRequests: number;
  cachedRequests: number;
}
