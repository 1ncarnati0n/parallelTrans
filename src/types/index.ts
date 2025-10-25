// 번역 엔진 타입
export type TranslationEngine = 'deepl' | 'libretranslate-public' | 'libretranslate-local';

// 번역 표시 모드
export type DisplayMode = 'parallel' | 'translation-only';

// 번역 트리거 모드
export type TriggerMode = 'auto' | 'manual';

// 번역 요청 인터페이스
export interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  engine?: TranslationEngine;
}

// 번역 응답 인터페이스
export interface TranslationResponse {
  translatedText: string;
  engine: TranslationEngine;
  cached?: boolean;
}

// 설정 인터페이스
export interface Settings {
  enabled: boolean;
  engine: TranslationEngine;
  deeplApiKey: string;
  libretranslateUrl: string;
  sourceLang: string;
  targetLang: string;
  excludedSites: string[];
  triggerMode: TriggerMode;           // 'auto' 또는 'manual' (Option+A)
  displayMode: DisplayMode;           // 'parallel' 또는 'translation-only'
  keyboardShortcut: string;           // 기본값: 'Alt+A'
}

// 캐시 항목
export interface CacheEntry {
  text: string;
  translation: string;
  timestamp: number;
}

// 메시지 타입
export type MessageType = 'translate' | 'getSettings' | 'updateSettings' | 'toggleTranslation';

// 메시지 인터페이스
export interface Message {
  type: MessageType;
  data?: any;
}

// 번역 결과
export interface TranslationResult {
  success: boolean;
  translation?: string;
  error?: string;
}
