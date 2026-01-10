/**
 * Popup Script
 */

import { Settings, Message, UpdateSettingsMessage, DisplayMode, TranslationEngine } from './types';

// ============== DOM ==============
const els = {
  enabled: document.getElementById('enabled') as HTMLInputElement,
  primaryEngine: document.getElementById('primaryEngine') as HTMLSelectElement,
  // DeepL
  deeplKey: document.getElementById('deeplKey') as HTMLInputElement,
  deeplIsFree: document.getElementById('deeplIsFree') as HTMLInputElement,
  // Google
  googleKey: document.getElementById('googleKey') as HTMLInputElement,
  // Settings
  sourceLang: document.getElementById('sourceLang') as HTMLSelectElement,
  targetLang: document.getElementById('targetLang') as HTMLSelectElement,
  displayMode: document.getElementById('displayMode') as HTMLSelectElement,
  // UI
  saveBtn: document.getElementById('saveBtn') as HTMLButtonElement,
  status: document.getElementById('status') as HTMLDivElement,
  stats: document.getElementById('stats') as HTMLDivElement,
};

// ============== 초기화 ==============
async function init() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' } as Message) as Settings;
    updateUI(settings);

    els.saveBtn.addEventListener('click', handleSave);
    els.primaryEngine.addEventListener('change', handleEngineChange);
    loadStats();
  } catch (error) {
    console.error('[Popup] Error:', error);
    showStatus('Failed to load settings', 'error');
  }
}

// ============== UI 업데이트 ==============
function updateUI(settings: Settings) {
  els.enabled.checked = settings.enabled;
  els.primaryEngine.value = settings.primaryEngine;

  // DeepL
  els.deeplKey.value = settings.deeplApiKey || '';
  els.deeplIsFree.checked = settings.deeplIsFree !== false;

  // Google
  els.googleKey.value = settings.googleApiKey || '';

  // Settings
  els.sourceLang.value = settings.sourceLang;
  els.targetLang.value = settings.targetLang;
  els.displayMode.value = settings.displayMode;

  // API 키 상태 체크
  checkApiKeyStatus(settings);
  highlightRequiredEngine(settings.primaryEngine);
}

/**
 * 선택된 엔진에 필요한 API 키 섹션 강조
 */
function highlightRequiredEngine(engine: TranslationEngine): void {
  const deeplSection = document.getElementById('deeplSection');
  const googleSection = document.getElementById('googleSection');

  // 모든 섹션 초기화
  deeplSection?.classList.remove('collapsed');
  googleSection?.classList.remove('collapsed');

  // 선택되지 않은 엔진 접기
  if (engine === 'deepl') {
    googleSection?.classList.add('collapsed');
  } else {
    // google-nmt 또는 gemini-llm은 모두 Google API 키 필요
    deeplSection?.classList.add('collapsed');
  }
}

/**
 * API 키 설정 상태 확인 및 안내
 */
function checkApiKeyStatus(settings: Settings): void {
  const engine = settings.primaryEngine;
  let hasRequiredKey = false;

  if (engine === 'deepl') {
    hasRequiredKey = Boolean(settings.deeplApiKey?.trim());
  } else {
    // google-nmt 또는 gemini-llm
    hasRequiredKey = Boolean(settings.googleApiKey?.trim());
  }

  if (!hasRequiredKey) {
    const engineName = engine === 'deepl' ? 'DeepL' : 'Google';
    showStatus(`Please enter your ${engineName} API key`, 'error');
  }
}

/**
 * 엔진 변경 시 필요한 API 키 섹션 표시
 */
function handleEngineChange(): void {
  const engine = els.primaryEngine.value as TranslationEngine;
  highlightRequiredEngine(engine);
}

// ============== 저장 ==============
async function handleSave() {
  try {
    els.saveBtn.disabled = true;

    const engine = els.primaryEngine.value as TranslationEngine;

    // API 키 검증
    const deeplKey = els.deeplKey.value.trim();
    const googleKey = els.googleKey.value.trim();

    // 선택된 엔진에 필요한 API 키 확인
    if (engine === 'deepl' && !deeplKey) {
      showStatus('Please enter your DeepL API key', 'error');
      els.saveBtn.disabled = false;
      return;
    }

    if ((engine === 'google-nmt' || engine === 'gemini-llm') && !googleKey) {
      showStatus('Please enter your Google API key', 'error');
      els.saveBtn.disabled = false;
      return;
    }

    const newSettings: Partial<Settings> = {
      enabled: els.enabled.checked,
      primaryEngine: engine,
      // DeepL
      deeplApiKey: deeplKey,
      deeplIsFree: els.deeplIsFree.checked,
      // Google (NMT + Gemini)
      googleApiKey: googleKey,
      geminiApiKey: googleKey, // 같은 키 사용
      // Settings
      sourceLang: els.sourceLang.value,
      targetLang: els.targetLang.value,
      displayMode: els.displayMode.value as DisplayMode,
    };

    await chrome.runtime.sendMessage({
      type: 'updateSettings',
      data: newSettings,
    } as UpdateSettingsMessage);

    showStatus('Settings saved!', 'success');
    loadStats();
  } catch (error) {
    console.error('[Popup] Save error:', error);
    showStatus('Failed to save', 'error');
  } finally {
    els.saveBtn.disabled = false;
  }
}

// ============== 캐시 통계 ==============
async function loadStats() {
  try {
    const stats = await chrome.runtime.sendMessage({ type: 'getCacheStats' } as Message);
    if (stats && els.stats) {
      const engineName = getEngineName(els.primaryEngine.value as TranslationEngine);
      els.stats.innerHTML = `
        Engine: <strong>${engineName}</strong> |
        Cache: ${stats.memorySize} items |
        Hit: ${stats.hitRate}% |
        Requests: ${stats.totalRequests}
      `;
    }
  } catch (error) {
    console.warn('[Popup] Stats error:', error);
  }
}

/**
 * 엔진 이름 반환
 */
function getEngineName(engine: TranslationEngine): string {
  const names: Record<TranslationEngine, string> = {
    'deepl': 'DeepL (NMT)',
    'google-nmt': 'Google (NMT)',
    'gemini-llm': 'Gemini (LLM)',
  };
  return names[engine] || engine;
}

// ============== 상태 표시 ==============
function showStatus(message: string, type: 'success' | 'error') {
  els.status.textContent = message;
  els.status.className = `status ${type}`;
  els.status.style.display = 'block';

  setTimeout(() => {
    els.status.style.display = 'none';
  }, 3000);
}

// ============== 초기화 ==============
document.addEventListener('DOMContentLoaded', init);
