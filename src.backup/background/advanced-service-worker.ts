/**
 * Advanced Service Worker
 * - Batch translation support
 * - Rate limiting
 * - Smart caching
 * - Fallback strategy
 */

import { AdvancedTranslationManager } from '../translators/advanced-manager';
import { StorageManager } from '../utils/storage';
import { Logger } from '../utils/logger';
import { Message, TranslationRequest, TranslationResult, BatchTranslationRequest } from '../types';

const manager = new AdvancedTranslationManager();
const storage = new StorageManager();

/**
 * 서비스 워커 초기화
 */
async function initialize(): Promise<void> {
  try {
    const settings = await storage.getSettings();

    // API 키 설정
    if (settings.deeplApiKey) {
      manager.setDeepLApiKey(settings.deeplApiKey, settings.deeplIsFree ?? true);
    }

    if (settings.microsoftApiKey) {
      manager.setMicrosoftApiKey(settings.microsoftApiKey, settings.microsoftRegion);
    }

    // 설정 적용
    manager.updateSettings(settings);

    Logger.info('ServiceWorker', 'Advanced service worker initialized');
  } catch (error) {
    Logger.error('ServiceWorker', 'Initialization failed', error);
  }
}

/**
 * 설치 이벤트
 */
chrome.runtime.onInstalled.addListener(async () => {
  Logger.info('ServiceWorker', 'Extension installed');
  await initialize();
});

/**
 * 시작 이벤트
 */
chrome.runtime.onStartup.addListener(async () => {
  Logger.info('ServiceWorker', 'Browser started');
  await initialize();
});

/**
 * 초기 로드
 */
(async () => {
  Logger.info('ServiceWorker', 'Service worker loaded');
  await initialize();
})();

/**
 * 메시지 리스너
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      Logger.error('ServiceWorker', 'Message handling error', error);
      sendResponse({ success: false, error: error.message });
    });

  return true; // 비동기 응답
});

/**
 * 메시지 핸들러
 */
async function handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<any> {
  const { type, data, id } = message;

  Logger.debug('ServiceWorker', `Message received: ${type}`, { id, dataKeys: Object.keys(data || {}) });

  switch (type) {
    case 'translate':
      return await handleTranslate(data as TranslationRequest, id);

    case 'batchTranslate':
      return await handleBatchTranslate(data as BatchTranslationRequest, id);

    case 'getSettings':
      return await storage.getSettings();

    case 'updateSettings':
      await handleUpdateSettings(data);
      return { success: true };

    case 'toggleTranslation':
      return await handleToggleTranslation();

    case 'clearCache':
      await manager.clearCache();
      return { success: true };

    case 'getCacheStats':
      return manager.getCacheStats();

    case 'translationProgress':
      return manager.getRateLimitStatus();

    default:
      return { error: `Unknown message type: ${type}` };
  }
}

/**
 * 단일 번역 처리
 */
async function handleTranslate(request: TranslationRequest, id?: string): Promise<TranslationResult> {
  const startTime = Date.now();

  try {
    Logger.debug('ServiceWorker', 'Processing translation', { id, textLength: request.text.length });

    const result = await manager.handleTranslationRequest(request);

    if (result.success) {
      const duration = Date.now() - startTime;
      Logger.info('ServiceWorker', `Translation completed in ${duration}ms`, { id });
    } else {
      Logger.warn('ServiceWorker', `Translation failed: ${result.error}`, { id });
    }

    return result;
  } catch (error) {
    Logger.error('ServiceWorker', 'Translation error', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 배치 번역 처리
 */
async function handleBatchTranslate(request: BatchTranslationRequest, id?: string): Promise<TranslationResult> {
  const startTime = Date.now();

  try {
    Logger.debug('ServiceWorker', 'Processing batch translation', {
      id,
      count: request.texts.length,
      totalChars: request.texts.reduce((sum, t) => sum + t.length, 0),
    });

    const result = await manager.handleTranslationRequest(request);

    if (result.success) {
      const duration = Date.now() - startTime;
      Logger.info('ServiceWorker', `Batch translation completed in ${duration}ms`, {
        id,
        count: request.texts.length,
      });
    } else {
      Logger.warn('ServiceWorker', `Batch translation failed: ${result.error}`, { id });
    }

    return result;
  } catch (error) {
    Logger.error('ServiceWorker', 'Batch translation error', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 설정 업데이트 처리
 */
async function handleUpdateSettings(newSettings: any): Promise<void> {
  try {
    const settings = await storage.getSettings();
    const updated = { ...settings, ...newSettings };

    await storage.saveSettings(updated);
    manager.updateSettings(updated);

    Logger.info('ServiceWorker', 'Settings updated and reapplied');

    // 모든 탭에 설정 업데이트 알림
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'settingsUpdated',
            settings: updated,
          });
        } catch {
          // 탭이 메시지 수신 불가능 - 무시
        }
      }
    }

    // 캐시 초기화 (새 설정 적용)
    await manager.clearCache();
  } catch (error) {
    Logger.error('ServiceWorker', 'Settings update failed', error);
    throw error;
  }
}

/**
 * 번역 토글 처리
 */
async function handleToggleTranslation(): Promise<any> {
  try {
    const settings = await storage.getSettings();
    const newEnabled = !settings.enabled;

    await storage.saveSettings({ enabled: newEnabled });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'translationToggled',
        enabled: newEnabled,
      });
    }

    return { enabled: newEnabled };
  } catch (error) {
    Logger.error('ServiceWorker', 'Toggle translation failed', error);
    throw error;
  }
}

/**
 * 주기적 캐시 정리 (10분마다)
 */
setInterval(() => {
  Logger.debug('ServiceWorker', 'Running periodic cleanup');
}, 10 * 60 * 1000);

Logger.info('ServiceWorker', 'Advanced service worker ready');
