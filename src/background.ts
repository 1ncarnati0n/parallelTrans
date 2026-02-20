/**
 * Service Worker / Background Script
 */

import { TranslationManager } from './translators';
import { TranslationCache, StorageManager, RateLimiter, Logger, delay, extractErrorMessage, isApiRelatedError, diagnoseApiError } from './utils';
import {
  Message,
  TranslationRequest,
  BatchTranslationRequest,
  Settings,
  TranslationEngine,
  CONSTANTS
} from './types';

const manager = new TranslationManager();
const cache = new TranslationCache();
const storage = new StorageManager();
const rateLimiter = new RateLimiter();

let settings: Settings;

// ============== 초기화 ==============
function getDefaultSettings(): Settings {
  return {
    enabled: true,
    // API Keys
    deeplApiKey: CONSTANTS.DEFAULT_DEEPL_API_KEY,
    deeplIsFree: true,
    groqApiKey: CONSTANTS.DEFAULT_GROQ_API_KEY,
    // Translation Settings
    sourceLang: 'en',
    targetLang: 'ko',
    primaryEngine: 'groq-llm', // 기본 엔진
    displayMode: 'parallel',
    cacheEnabled: true,
    viewportTranslation: true,
  };
}

async function initialize() {
  try {
    const stored = await storage.get<Settings>('settings');
    const defaults = getDefaultSettings();

    if (stored) {
      settings = { ...defaults, ...stored }; // 새 필드 추가 시 기본값 병합

      // 마이그레이션 가드: 삭제된 엔진(google-nmt, gemini-llm) → deepl 자동 전환
      const validEngines: TranslationEngine[] = ['deepl', 'groq-llm'];
      if (!validEngines.includes(settings.primaryEngine)) {
        Logger.info('Background', `삭제된 엔진 '${settings.primaryEngine}' → 'groq-llm'으로 마이그레이션`);
        settings.primaryEngine = 'groq-llm';
      }

      // 환경변수 API 키가 있으면 저장된 빈 키를 덮어씀 (개발 편의성)
      let needsUpdate = false;

      if (defaults.deeplApiKey && !settings.deeplApiKey) {
        settings.deeplApiKey = defaults.deeplApiKey;
        needsUpdate = true;
        Logger.info('Background', 'DeepL API 키가 환경변수에서 로드됨');
      }

      if (defaults.groqApiKey && !settings.groqApiKey) {
        settings.groqApiKey = defaults.groqApiKey;
        needsUpdate = true;
        Logger.info('Background', 'Groq API 키가 환경변수에서 로드됨');
      }

      if (needsUpdate) {
        await storage.set('settings', settings);
      }
    } else {
      settings = defaults;
      await storage.set('settings', settings);
      Logger.info('Background', '기본 설정 저장 완료 (API 키 포함)');
    }

    manager.configure(settings);
    Logger.info('Background', '✅ Service worker ready');
  } catch (error) {
    Logger.error('Background', 'Init failed', error);
    settings = getDefaultSettings();
  }
}

// ============== 입력 검증 ==============
function validateText(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Empty text' };
  }

  if (text.length > CONSTANTS.MAX_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Text too long (max ${CONSTANTS.MAX_TEXT_LENGTH} characters)`,
    };
  }

  return { valid: true };
}

function validateBatchTexts(texts: string[]): { valid: boolean; error?: string } {
  if (!texts || texts.length === 0) {
    return { valid: false, error: 'Empty batch' };
  }

  for (const text of texts) {
    const result = validateText(text);
    if (!result.valid) {
      return result;
    }
  }

  return { valid: true };
}

// ============== 메시지 핸들러 ==============
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(error => {
    Logger.error('Background', 'Message error', error);
    sendResponse({ success: false, error: extractErrorMessage(error) });
  });
  return true;
});

async function handleMessage(message: Message) {
  Logger.debug('Background', `Message: ${message.type}`);

  switch (message.type) {
    case 'translate': {
      const request: TranslationRequest = message.data;
      return await handleTranslate(request);
    }

    case 'batchTranslate': {
      const request: BatchTranslationRequest = message.data;
      return await handleBatchTranslate(request);
    }

    case 'getSettings':
      return settings;

    case 'updateSettings': {
      settings = { ...settings, ...message.data };
      await storage.set('settings', settings);
      manager.configure(settings);
      await cache.clear();

      // 모든 탭에 설정 변경 알림
      try {
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'settingsUpdated',
              settings,
            } as Message).catch(() => {
              // 탭이 준비되지 않았거나 접근 불가능한 경우 무시
            });
          }
        });
      } catch (error) {
        Logger.warn('Background', 'Failed to broadcast settings update', error);
      }

      return { success: true };
    }

    case 'getCacheStats':
      return cache.getStats();

    default:
      return { error: 'Unknown message type' };
  }
}

// ============== 번역 (Fallback 지원) ==============
async function translateWithFallback(
  request: TranslationRequest,
  engines: TranslationEngine[]
): Promise<{ success: boolean; translation?: string; error?: string }> {
  for (let i = 0; i < engines.length; i++) {
    const engine = engines[i];
    const isLastEngine = i === engines.length - 1;

    try {
      await rateLimiter.waitForSlot(engine);
      const response = await manager.translate(engine, request);
      await cache.set(
        request.text,
        response.translatedText,
        request.sourceLang,
        request.targetLang,
        engine
      );

      Logger.debug('Background', `번역 성공: ${engine}`);
      return { success: true, translation: response.translatedText };
    } catch (error: unknown) {
      const errorMsg = extractErrorMessage(error, 'Translation failed');

      if (isLastEngine) {
        Logger.error('Background', '모든 엔진 실패', error);
        return { success: false, error: `Translation failed: ${errorMsg}` };
      } else {
        Logger.warn('Background', `${engine} 실패 (${errorMsg}), 다음 엔진 시도: ${engines[i + 1]}`);
      }
    }
  }

  return { success: false, error: 'All translation engines failed' };
}

async function handleTranslate(request: TranslationRequest) {
  const startTime = Date.now();

  // 입력 검증
  const validation = validateText(request.text);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // 캐시 확인
    const cached = await cache.get(request.text, request.sourceLang, request.targetLang, settings.primaryEngine);
    if (cached) {
      Logger.debug('Background', `Cache hit (${Date.now() - startTime}ms)`);
      return { success: true, translation: cached.translation };
    }

    // 번역 (단일 엔진)
    const engines: TranslationEngine[] = [settings.primaryEngine];
    const result = await translateWithFallback(request, engines);

    Logger.debug('Background', `Translated (${Date.now() - startTime}ms)`);
    return result;
  } catch (error: unknown) {
    Logger.error('Background', 'Translation error', error);
    return { success: false, error: extractErrorMessage(error, 'Translation failed') };
  }
}

// ============== 배치 번역 ==============
async function handleBatchTranslate(request: BatchTranslationRequest) {
  // 입력 검증
  const validation = validateBatchTexts(request.texts);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const results: string[] = new Array(request.texts.length);
    const uncachedTexts: { index: number; text: string }[] = [];

    // 캐시 확인 (병렬 조회)
    const cacheChecks = request.texts.map(async (text, index) => {
      const cached = await cache.get(text, request.sourceLang, request.targetLang, settings.primaryEngine);
      return { index, text, cached };
    });

    const cacheResults = await Promise.all(cacheChecks);

    // 결과 분류
    for (const { index, text, cached } of cacheResults) {
      if (cached) {
        results[index] = cached.translation;
      } else {
        uncachedTexts.push({ index, text });
      }
    }

    Logger.debug('Background', `배치: ${uncachedTexts.length}/${request.texts.length} 캐시 미스`);

    // 캐시되지 않은 텍스트 번역
    if (uncachedTexts.length > 0) {
      const batchSize = CONSTANTS.DEFAULT_BATCH_SIZE;

      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);
        const texts = batch.map(b => b.text);
        const totalChars = texts.reduce((sum, text) => sum + text.length, 0);

        // 엔진으로 번역
        const result = await translateBatchWithEngine(
          settings.primaryEngine,
          batch,
          texts,
          totalChars,
          request.sourceLang,
          request.targetLang,
          results
        );

        if (!result.success) {
          const errorInfo = result.errorInfo;
          Logger.error('Background', `배치 번역 실패 (${texts.length}개)`);
          return {
            success: false,
            error: `Batch translation failed: ${errorInfo?.message || 'Unknown error'}`,
            errorCategory: errorInfo?.category,
            isApiError: true
          };
        }

        // 배치 간 딜레이
        if (i + batchSize < uncachedTexts.length) {
          await delay(CONSTANTS.BATCH_INTERVAL_DELAY_MS);
        }
      }
    }

    return { success: true, translations: results };
  } catch (error: unknown) {
    Logger.error('Background', 'Batch translation error', error);
    return { success: false, error: extractErrorMessage(error, 'Batch translation failed') };
  }
}

interface BatchEngineResult {
  success: boolean;
  errorInfo?: {
    message: string;
    category: string;
    status: number;
  };
}

async function translateBatchWithEngine(
  engine: TranslationEngine,
  batch: { index: number; text: string }[],
  texts: string[],
  totalChars: number,
  sourceLang: string,
  targetLang: string,
  results: string[]
): Promise<BatchEngineResult> {
  try {
    await rateLimiter.waitForBatch(engine, totalChars);

    const response = await manager.translateBatch(engine, {
      texts,
      sourceLang,
      targetLang,
    });

    // 결과 매핑 및 캐시 저장
    batch.forEach((item, idx) => {
      results[item.index] = response.translations[idx];
      cache.set(item.text, response.translations[idx], sourceLang, targetLang, engine);
    });

    return { success: true };
  } catch (error: unknown) {
    // API 관련 오류인지 확인하여 상세 진단 제공
    if (isApiRelatedError(error)) {
      const diagnosis = diagnoseApiError(error);
      Logger.error('Background', `${engine} 배치 번역 실패:\n${diagnosis}`);
      return {
        success: false,
        errorInfo: {
          message: diagnosis,
          category: error.category,
          status: error.status,
        },
      };
    } else {
      const errMsg = extractErrorMessage(error, '알 수 없는 오류');
      Logger.error('Background', `${engine} 배치 번역 실패 (비API 오류)`, error);
      return {
        success: false,
        errorInfo: {
          message: errMsg,
          category: 'UNKNOWN',
          status: 0,
        },
      };
    }
  }
}

// ============== 초기화 ==============
initialize();
chrome.runtime.onInstalled.addListener(() => initialize());
