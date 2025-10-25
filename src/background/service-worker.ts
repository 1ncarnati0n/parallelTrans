import { TranslationManager } from '../utils/translators';
import { TranslationCache } from '../utils/cache';
import { StorageManager } from '../utils/storage';
import { Message, TranslationRequest, TranslationResult } from '../types';

// 번역 매니저 및 캐시 초기화
const translationManager = new TranslationManager();
const cache = new TranslationCache();
const storage = new StorageManager();

/**
 * 확장프로그램 설치 시 초기화
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('ParallelTrans installed!');

  // 기본 설정 초기화
  const settings = await storage.getSettings();

  // 번역 엔진 설정
  if (settings.deeplApiKey) {
    translationManager.setDeepLApiKey(settings.deeplApiKey);
  }
  if (settings.libretranslateUrl) {
    translationManager.setLibreTranslateUrl(settings.libretranslateUrl);
  }
  translationManager.setEngine(settings.engine);
});

/**
 * 메시지 리스너
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // 비동기 응답을 위해 true 반환
});

/**
 * 메시지 핸들러
 */
async function handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<any> {
  switch (message.type) {
    case 'translate':
      return await handleTranslate(message.data);

    case 'getSettings':
      return await storage.getSettings();

    case 'updateSettings':
      await handleUpdateSettings(message.data);
      return { success: true };

    case 'toggleTranslation':
      return await handleToggleTranslation();

    default:
      return { error: 'Unknown message type' };
  }
}

/**
 * 번역 처리
 */
async function handleTranslate(request: TranslationRequest): Promise<TranslationResult> {
  try {
    // 캐시 확인
    const cached = cache.get(request.text, request.sourceLang, request.targetLang);
    if (cached) {
      return {
        success: true,
        translation: cached
      };
    }

    // 설정 가져오기
    const settings = await storage.getSettings();

    // 번역 요청
    const response = await translationManager.translate({
      ...request,
      engine: settings.engine
    });

    // 캐시에 저장
    cache.set(request.text, response.translatedText, request.sourceLang, request.targetLang);

    return {
      success: true,
      translation: response.translatedText
    };
  } catch (error) {
    console.error('Translation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Translation failed'
    };
  }
}

/**
 * 설정 업데이트 처리
 */
async function handleUpdateSettings(newSettings: any): Promise<void> {
  await storage.saveSettings(newSettings);

  // 번역 엔진 재설정
  const settings = await storage.getSettings();

  if (settings.deeplApiKey) {
    translationManager.setDeepLApiKey(settings.deeplApiKey);
  }
  if (settings.libretranslateUrl) {
    translationManager.setLibreTranslateUrl(settings.libretranslateUrl);
  }
  translationManager.setEngine(settings.engine);

  // 캐시 초기화 (설정 변경시)
  cache.clear();
}

/**
 * 번역 토글 처리
 */
async function handleToggleTranslation(): Promise<any> {
  const settings = await storage.getSettings();
  const newEnabled = !settings.enabled;
  await storage.saveSettings({ enabled: newEnabled });

  // 현재 활성 탭에 메시지 전송
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'translationToggled',
      enabled: newEnabled
    });
  }

  return { enabled: newEnabled };
}

/**
 * 주기적으로 캐시 정리
 */
setInterval(() => {
  cache.cleanup();
}, 60000 * 10); // 10분마다

console.log('ParallelTrans service worker loaded');
