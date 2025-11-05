/**
 * Core Type Definitions
 * Single source of truth for all types
 */

// ============== 상수 ==============
export const CONSTANTS = {
  // 캐시 설정
  CACHE_MAX_SIZE: 2000,
  CACHE_TTL_MS: 60 * 60 * 1000, // 1시간

  // 텍스트 검증
  MIN_TEXT_LENGTH: 3,
  MAX_TEXT_LENGTH: 5000,

  // 메모리 제한
  MAX_PENDING_TEXTS: 1000,
  MAX_TRANSLATED_NODES: 5000, // translatedTexts Set 최대 크기

  // 배치 처리
  DEFAULT_BATCH_SIZE: 10,
  BATCH_PROCESSING_DELAY_MS: 100,
  BATCH_INTERVAL_DELAY_MS: 50,

  // Rate Limiting (ms)
  RATE_LIMIT_DEEPL: 1200,
  RATE_LIMIT_MICROSOFT: 100,

  // API 기본 키 (환경 변수에서 로드)
  DEFAULT_DEEPL_API_KEY: process.env.DEEPL_API_KEY || '',
  DEFAULT_MICROSOFT_API_KEY: process.env.AZURE_TRANSLATION_KEY || '',
} as const;

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
export type MessageType = 
  | 'translate' 
  | 'batchTranslate' 
  | 'getSettings' 
  | 'updateSettings' 
  | 'getCacheStats'
  | 'settingsUpdated'
  | 'translationToggle';

export interface TranslateMessage {
  type: 'translate';
  data: TranslationRequest;
}

export interface BatchTranslateMessage {
  type: 'batchTranslate';
  data: BatchTranslationRequest;
}

export interface GetSettingsMessage {
  type: 'getSettings';
}

export interface UpdateSettingsMessage {
  type: 'updateSettings';
  data: Partial<Settings>;
}

export interface GetCacheStatsMessage {
  type: 'getCacheStats';
}

export interface SettingsUpdatedMessage {
  type: 'settingsUpdated';
  settings: Settings;
}

export interface TranslationToggleMessage {
  type: 'translationToggle';
  enabled: boolean;
}

export type Message = 
  | TranslateMessage
  | BatchTranslateMessage
  | GetSettingsMessage
  | UpdateSettingsMessage
  | GetCacheStatsMessage
  | SettingsUpdatedMessage
  | TranslationToggleMessage;

export interface TranslationResult {
  success: boolean;
  translation?: string;
  translations?: string[];
  error?: string;
}

// ============== API 에러 ==============
export interface ApiError {
  status: number;
  message: string;
  engine: TranslationEngine;
  details?: unknown;
}

// ============== 캐시 통계 ==============
export interface CacheStats {
  memorySize: number;
  hitRate: number;
  totalRequests: number;
  cachedRequests: number;
}
