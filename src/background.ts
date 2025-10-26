/**
 * Service Worker / Background Script
 */

import { TranslationManager } from './translators';
import { TranslationCache, StorageManager, RateLimiter, Logger } from './utils';
import { Message, TranslationRequest, BatchTranslationRequest, Settings } from './types';

const manager = new TranslationManager();
const cache = new TranslationCache();
const storage = new StorageManager();
const rateLimiter = new RateLimiter();

let settings: Settings;

// ============== 초기화 ==============
function getDefaultSettings(): Settings {
  return {
    enabled: true,
    deeplApiKey: '',
    deeplIsFree: true,
    microsoftApiKey: '',
    microsoftRegion: 'global',
    sourceLang: 'en',
    targetLang: 'ko',
    primaryEngine: 'deepl',
    fallbackEngine: 'microsoft',
    displayMode: 'parallel',
    batchSize: 10,
    cacheEnabled: true,
    viewportTranslation: true,
  };
}

async function initialize() {
  try {
    const stored = await storage.get('settings');
    settings = stored || getDefaultSettings();

    if (!stored) {
      await storage.set('settings', settings);
    }

    manager.configure(settings);
    Logger.info('Background', '✅ Service worker ready');
  } catch (error) {
    Logger.error('Background', 'Init failed', error);
    settings = getDefaultSettings();
  }
}

// ============== 메시지 핸들러 ==============
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(error => {
    Logger.error('Background', 'Message error', error);
    sendResponse({ success: false, error: error.message });
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
      return { success: true };
    }

    case 'getCacheStats':
      return cache.getStats();

    default:
      return { error: 'Unknown message type' };
  }
}

async function handleTranslate(request: TranslationRequest) {
  const startTime = Date.now();

  try {
    // 캐시 확인
    const cached = await cache.get(request.text, request.sourceLang, request.targetLang);
    if (cached) {
      Logger.debug('Background', `Cache hit (${Date.now() - startTime}ms)`);
      return { success: true, translation: cached.translation };
    }

    // 레이트 제한 대기
    await rateLimiter.waitForSlot(settings.primaryEngine);

    // 번역
    const response = await manager.translate(settings.primaryEngine, request);

    // 캐시 저장
    await cache.set(request.text, response.translatedText, request.sourceLang, request.targetLang, settings.primaryEngine);

    Logger.debug('Background', `Translated (${Date.now() - startTime}ms)`);
    return { success: true, translation: response.translatedText };
  } catch (error) {
    // 폴백 시도
    try {
      Logger.warn('Background', 'Primary engine failed, trying fallback');
      await rateLimiter.waitForSlot(settings.fallbackEngine);
      const response = await manager.translate(settings.fallbackEngine, request);
      await cache.set(request.text, response.translatedText, request.sourceLang, request.targetLang, settings.fallbackEngine);
      return { success: true, translation: response.translatedText };
    } catch (fallbackError) {
      Logger.error('Background', 'Translation failed', error);
      return { success: false, error: 'Translation failed' };
    }
  }
}

async function handleBatchTranslate(request: BatchTranslationRequest) {
  try {
    const results: string[] = new Array(request.texts.length);
    const uncachedTexts: { index: number; text: string }[] = [];

    // 캐시 확인
    for (let i = 0; i < request.texts.length; i++) {
      const cached = await cache.get(request.texts[i], request.sourceLang, request.targetLang);
      if (cached) {
        results[i] = cached.translation;
      } else {
        uncachedTexts.push({ index: i, text: request.texts[i] });
      }
    }

    // 캐시되지 않은 텍스트 번역
    if (uncachedTexts.length > 0) {
      const batchSize = settings.batchSize;
      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);
        const texts = batch.map(b => b.text);

        await rateLimiter.waitForSlot(settings.primaryEngine);

        const response = await manager.translateBatch(settings.primaryEngine, {
          texts,
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
        });

        // 결과 매핑
        batch.forEach((item, idx) => {
          results[item.index] = response.translations[idx];
          cache.set(item.text, response.translations[idx], request.sourceLang, request.targetLang, settings.primaryEngine);
        });
      }
    }

    return { success: true, translations: results };
  } catch (error) {
    Logger.error('Background', 'Batch translation failed', error);
    return { success: false, error: 'Batch translation failed' };
  }
}

// ============== 초기화 ==============
initialize();
chrome.runtime.onInstalled.addListener(() => initialize());
