/**
 * Popup Script
 */

import { Settings } from './types';

// ============== DOM ==============
const els = {
  enabled: document.getElementById('enabled') as HTMLInputElement,
  deeplKey: document.getElementById('deeplKey') as HTMLInputElement,
  microsoftKey: document.getElementById('microsoftKey') as HTMLInputElement,
  microsoftRegion: document.getElementById('microsoftRegion') as HTMLInputElement,
  primaryEngine: document.getElementById('primaryEngine') as HTMLSelectElement,
  fallbackEngine: document.getElementById('fallbackEngine') as HTMLSelectElement,
  sourceLang: document.getElementById('sourceLang') as HTMLSelectElement,
  targetLang: document.getElementById('targetLang') as HTMLSelectElement,
  displayMode: document.getElementById('displayMode') as HTMLSelectElement,
  batchSize: document.getElementById('batchSize') as HTMLInputElement,
  saveBtn: document.getElementById('saveBtn') as HTMLButtonElement,
  status: document.getElementById('status') as HTMLDivElement,
  stats: document.getElementById('stats') as HTMLDivElement,
};

// ============== 초기화 ==============
async function init() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
    updateUI(settings);

    els.saveBtn.addEventListener('click', handleSave);
    loadStats();
  } catch (error) {
    console.error('[Popup] Error:', error);
    showStatus('설정 로드 실패', 'error');
  }
}

// ============== UI 업데이트 ==============
function updateUI(settings: Settings) {
  els.enabled.checked = settings.enabled;
  els.deeplKey.value = settings.deeplApiKey;
  els.microsoftKey.value = settings.microsoftApiKey;
  els.microsoftRegion.value = settings.microsoftRegion;
  els.primaryEngine.value = settings.primaryEngine;
  els.fallbackEngine.value = settings.fallbackEngine;
  els.sourceLang.value = settings.sourceLang;
  els.targetLang.value = settings.targetLang;
  els.displayMode.value = settings.displayMode;
  els.batchSize.value = String(settings.batchSize);
}

// ============== 저장 ==============
async function handleSave() {
  try {
    els.saveBtn.disabled = true;

    // API 키 검증
    const deeplKey = els.deeplKey.value.trim();
    const microsoftKey = els.microsoftKey.value.trim();

    if (!deeplKey && !microsoftKey) {
      showStatus('최소 하나의 API 키를 입력해주세요', 'error');
      els.saveBtn.disabled = false;
      return;
    }

    const newSettings: Partial<Settings> = {
      enabled: els.enabled.checked,
      deeplApiKey: deeplKey,
      microsoftApiKey: microsoftKey,
      microsoftRegion: els.microsoftRegion.value.trim() || 'global',
      primaryEngine: els.primaryEngine.value as any,
      fallbackEngine: els.fallbackEngine.value as any,
      sourceLang: els.sourceLang.value,
      targetLang: els.targetLang.value,
      displayMode: els.displayMode.value as any,
      batchSize: parseInt(els.batchSize.value) || 10,
    };

    await chrome.runtime.sendMessage({
      type: 'updateSettings',
      data: newSettings,
    });

    showStatus('✅ 설정이 저장되었습니다!', 'success');
    loadStats();
  } catch (error) {
    console.error('[Popup] Save error:', error);
    showStatus('❌ 저장 실패했습니다', 'error');
  } finally {
    els.saveBtn.disabled = false;
  }
}

// ============== 캐시 통계 ==============
async function loadStats() {
  try {
    const stats = await chrome.runtime.sendMessage({ type: 'getCacheStats' });
    if (stats && els.stats) {
      els.stats.innerHTML = `
        Cache: ${stats.memorySize} items | Hit: ${stats.hitRate}% | Requests: ${stats.totalRequests}
      `;
    }
  } catch (error) {
    console.warn('[Popup] Stats error:', error);
  }
}

// ============== 상태 표시 ==============
function showStatus(message: string, type: 'success' | 'error') {
  els.status.textContent = message;
  els.status.className = `status ${type}`;
  els.status.style.display = 'block';

  setTimeout(() => {
    els.status.style.display = 'none';
  }, 2000);
}

// ============== 초기화 ==============
document.addEventListener('DOMContentLoaded', init);
