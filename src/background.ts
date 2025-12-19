/**
 * Service Worker / Background Script
 */

import { TranslationManager } from './translators';
import { TranslationCache, StorageManager, RateLimiter, Logger, delay, extractErrorMessage } from './utils';
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
    deeplApiKey: CONSTANTS.DEFAULT_DEEPL_API_KEY,
    deeplIsFree: true,
    microsoftApiKey: CONSTANTS.DEFAULT_MICROSOFT_API_KEY,
    microsoftRegion: 'global',
    sourceLang: 'en',
    targetLang: 'ko',
    primaryEngine: 'deepl',
    fallbackEngine: 'microsoft',
    displayMode: 'parallel',
    cacheEnabled: true,
    viewportTranslation: true,
  };
}

async function initialize() {
  try {
    const stored = await storage.get<Settings>('settings');
    settings = stored ?? getDefaultSettings();

    if (!stored) {
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
    // 캐시 확인 (엔진 우선순위로 검색)
    let cached = await cache.get(request.text, request.sourceLang, request.targetLang, settings.primaryEngine);
    if (!cached) {
      cached = await cache.get(request.text, request.sourceLang, request.targetLang, settings.fallbackEngine);
    }
    if (cached) {
      Logger.debug('Background', `Cache hit (${Date.now() - startTime}ms)`);
      return { success: true, translation: cached.translation };
    }

    // Fallback을 고려한 번역
    const engines: TranslationEngine[] = [settings.primaryEngine, settings.fallbackEngine];
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
      // Primary 엔진 캐시 먼저 확인
      let cached = await cache.get(text, request.sourceLang, request.targetLang, settings.primaryEngine);
      if (!cached) {
        // Fallback 엔진 캐시 확인
        cached = await cache.get(text, request.sourceLang, request.targetLang, settings.fallbackEngine);
      }
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

        // Primary 엔진 시도
        const success = await translateBatchWithEngine(
          settings.primaryEngine,
          batch,
          texts,
          totalChars,
          request.sourceLang,
          request.targetLang,
          results
        );

        // Primary 실패 시 Fallback 시도
        if (!success) {
          Logger.warn('Background', `${settings.primaryEngine} 배치 실패, ${settings.fallbackEngine} 시도`);

          const fallbackSuccess = await translateBatchWithEngine(
            settings.fallbackEngine,
            batch,
            texts,
            totalChars,
            request.sourceLang,
            request.targetLang,
            results
          );

          if (!fallbackSuccess) {
            Logger.error('Background', `배치 번역 완전 실패 (${texts.length}개)`);
            return { success: false, error: 'Batch translation failed on all engines' };
          }
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

async function translateBatchWithEngine(
  engine: TranslationEngine,
  batch: { index: number; text: string }[],
  texts: string[],
  totalChars: number,
  sourceLang: string,
  targetLang: string,
  results: string[]
): Promise<boolean> {
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

    return true;
  } catch (error: unknown) {
    Logger.error('Background', `${engine} 배치 번역 실패`, error);
    return false;
  }
}

// ============== 초기화 ==============
initialize();
chrome.runtime.onInstalled.addListener(() => initialize());
