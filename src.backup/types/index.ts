// ==================== 번역 엔진 ====================
export type TranslationEngine = 'deepl' | 'microsoft';

// 번역 표시 모드
export type DisplayMode = 'parallel' | 'translation-only';

// 번역 트리거 모드
export type TriggerMode = 'auto' | 'manual';

// ==================== 번역 요청/응답 ====================

export interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  engine?: TranslationEngine;
}

export interface BatchTranslationRequest {
  texts: string[];
  sourceLang: string;
  targetLang: string;
  engine?: TranslationEngine;
}

export interface TranslationResponse {
  translatedText: string;
  engine: TranslationEngine;
  cached?: boolean;
}

export interface BatchTranslationResponse {
  translations: string[];
  engine: TranslationEngine;
  cached?: boolean;
}

export interface TranslationResult {
  success: boolean;
  translation?: string;
  translations?: string[];
  error?: string;
  retryAfter?: number; // Rate limit 재시도 대기시간 (초)
}

// ==================== 설정 ====================

export interface Settings {
  enabled: boolean;
  deeplApiKey: string;
  deeplIsFree: boolean; // true: free tier (5 req/sec), false: pro tier
  microsoftApiKey: string;
  microsoftRegion: string;
  sourceLang: string;
  targetLang: string;
  excludedSites: string[];
  triggerMode: TriggerMode;
  displayMode: DisplayMode;
  keyboardShortcut: string;
  primaryEngine: TranslationEngine; // 우선 사용 엔진
  fallbackEngine: TranslationEngine; // 폴백 엔진
  enableBatchTranslation: boolean; // 배치 번역 활성화
  batchSize: number; // 배치당 텍스트 수
  cacheEnabled: boolean;
  cacheTTL: number; // 캐시 유효시간 (분)
  viewportTranslation: boolean; // Viewport 기반 번역
}

// ==================== 캐시 ====================

export interface CacheEntry {
  text: string;
  translation: string;
  timestamp: number;
  engine: TranslationEngine;
}

export interface CacheIndex {
  key: string; // "sourceLang:targetLang:text"
  engine: TranslationEngine;
  timestamp: number;
}

// ==================== 레이트 제한 ====================

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  batchSize?: number; // 배치 번역 최대 크기
}

export interface RateLimitState {
  engine: TranslationEngine;
  tokens: number;
  lastRefillTime: number;
  isLimited: boolean;
  retryAfter?: number;
}

// ==================== 큐 및 배치 ====================

export interface QueueItem {
  id: string;
  texts: string[];
  sourceLang: string;
  targetLang: string;
  engine: TranslationEngine;
  priority: number; // 높을수록 우선 처리
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface BatchTranslationTask {
  id: string;
  items: QueueItem[];
  timestamp: number;
}

// ==================== DOM 및 렌더링 ====================

export interface TranslationMeta {
  nodeId: string;
  originalText: string;
  translatedText: string;
  engine: TranslationEngine;
  timestamp: number;
}

export interface ViewportInfo {
  top: number;
  bottom: number;
  height: number;
}

// ==================== 메시지 ====================

export type MessageType =
  | 'translate'
  | 'batchTranslate'
  | 'getSettings'
  | 'updateSettings'
  | 'toggleTranslation'
  | 'clearCache'
  | 'getCacheStats'
  | 'translationProgress';

export interface Message {
  type: MessageType;
  data?: any;
  id?: string; // 요청 추적용
}

// ==================== 로깅 ====================

export interface TranslationLog {
  engine: TranslationEngine;
  textLength: number;
  duration: number;
  cached: boolean;
  success: boolean;
  timestamp: number;
  error?: string;
}

export interface PerformanceMetrics {
  totalRequests: number;
  cachedRequests: number;
  averageResponseTime: number;
  totalCharactersTranslated: number;
  apiUsage: Record<TranslationEngine, number>;
}
