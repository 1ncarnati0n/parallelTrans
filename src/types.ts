/**
 * Core Type Definitions
 * Single source of truth for all types
 */

// ============== Intl.Segmenter 타입 선언 (Chrome 87+) ==============
declare global {
  namespace Intl {
    interface SegmenterOptions {
      granularity?: 'grapheme' | 'word' | 'sentence';
    }

    interface SegmentData {
      segment: string;
      index: number;
      isWordLike?: boolean;
    }

    interface Segments {
      [Symbol.iterator](): IterableIterator<SegmentData>;
    }

    class Segmenter {
      constructor(locale?: string, options?: SegmenterOptions);
      segment(input: string): Segments;
    }
  }
}

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
  DEFAULT_BATCH_SIZE: 20,
  BATCH_PROCESSING_DELAY_MS: 50,
  BATCH_INTERVAL_DELAY_MS: 30,

  // Hydration grace period
  HYDRATION_GRACE_PERIOD_MS: 1200,

  // 텍스트 청킹
  MAX_CHUNK_LENGTH: 500,
  MAX_CHUNK_SENTENCES: 5,

  // Rate Limiting (ms)
  RATE_LIMIT_DEEPL: 100,
  RATE_LIMIT_GOOGLE: 50,
  RATE_LIMIT_GEMINI: 200, // LLM은 더 느리므로 여유 있게

  // 재시도 설정
  MAX_RETRY_COUNT: 3,
  RETRY_DELAY_MS: 1000,

  // API 기본 키 (.env에서 자동 로드)
  DEFAULT_DEEPL_API_KEY: process.env.DEEPL_API_KEY || '',
  DEFAULT_GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  DEFAULT_GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

  // 블록 레벨 요소
  BLOCK_ELEMENTS: ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'BLOCKQUOTE', 'ARTICLE', 'SECTION', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FIGCAPTION'],

  // 제외할 요소
  EXCLUDED_ELEMENTS: ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'IFRAME', 'SVG'],
} as const;

// ============== 번역 엔진 ==============
/**
 * 번역 엔진 타입
 * - deepl: DeepL API (NMT - Neural Machine Translation)
 * - google-nmt: Google Cloud Translation API (NMT)
 * - gemini-llm: Google Gemini API (LLM-based translation)
 */
export type TranslationEngine = 'deepl' | 'google-nmt' | 'gemini-llm';
export type DisplayMode = 'parallel' | 'translation-only';
export type TriggerMode = 'auto' | 'manual';

// 엔진 메타데이터
export const ENGINE_INFO: Record<TranslationEngine, { name: string; type: 'nmt' | 'llm'; description: string }> = {
  'deepl': { name: 'DeepL', type: 'nmt', description: 'High quality NMT, fast' },
  'google-nmt': { name: 'Google Translate', type: 'nmt', description: 'Broad language support, very fast' },
  'gemini-llm': { name: 'Gemini', type: 'llm', description: 'Context-aware LLM translation' },
};

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
  // API Keys
  deeplApiKey: string;
  deeplIsFree: boolean; // DeepL Free vs Pro
  googleApiKey: string; // Google Cloud Translation & Gemini 공용
  geminiApiKey: string; // Gemini 전용 (선택)
  // Translation Settings
  sourceLang: string;
  targetLang: string;
  primaryEngine: TranslationEngine;
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
export type ApiErrorCategory = 
  | 'NETWORK'       // 네트워크 연결 실패
  | 'AUTH'          // 인증 오류 (401, 403, 잘못된 API 키)
  | 'QUOTA'         // 할당량 초과 (429, 456)
  | 'SERVER'        // 서버 오류 (5xx)
  | 'INVALID_KEY'   // API 키 형식 오류
  | 'RATE_LIMIT'    // 요청 속도 제한
  | 'UNKNOWN';      // 알 수 없는 오류

export interface ApiError {
  status: number;
  message: string;
  engine: TranslationEngine;
  category: ApiErrorCategory;
  isRetryable: boolean;
  details?: unknown;
  timestamp?: number;
}

// ============== 캐시 통계 ==============
export interface CacheStats {
  memorySize: number;
  hitRate: number;
  totalRequests: number;
  cachedRequests: number;
}
