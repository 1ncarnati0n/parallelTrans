/**
 * Popup UI for ParallelTrans
 */

import { Settings } from '../types';

// DOM 요소
const enableToggle = document.getElementById('enableToggle') as HTMLInputElement;
const deeplApiKey = document.getElementById('deeplApiKey') as HTMLInputElement;
const deeplIsFree = document.getElementById('deeplIsFree') as HTMLInputElement;
const microsoftApiKey = document.getElementById('microsoftApiKey') as HTMLInputElement;
const microsoftRegion = document.getElementById('microsoftRegion') as HTMLInputElement;
const primaryEngine = document.getElementById('primaryEngine') as HTMLSelectElement;
const fallbackEngine = document.getElementById('fallbackEngine') as HTMLSelectElement;
const sourceLang = document.getElementById('sourceLang') as HTMLSelectElement;
const targetLang = document.getElementById('targetLang') as HTMLSelectElement;
const displayMode = document.getElementById('displayMode') as HTMLSelectElement;
const batchSize = document.getElementById('batchSize') as HTMLInputElement;
const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const cacheStatsDiv = document.getElementById('cacheStats') as HTMLDivElement;

/**
 * 초기화
 */
async function init() {
  try {
    const settings = await loadSettings();
    updateUI(settings);

    // 이벤트 리스너
    saveButton.addEventListener('click', handleSave);

    // 캐시 통계 로드
    loadCacheStats();

    console.log('[Popup] Initialized');
  } catch (error) {
    console.error('[Popup] Initialization error:', error);
    showStatus('설정을 불러오는데 실패했습니다', 'error');
  }
}

/**
 * 설정 로드
 */
async function loadSettings(): Promise<Settings> {
  return await chrome.runtime.sendMessage({ type: 'getSettings' });
}

/**
 * UI 업데이트
 */
function updateUI(settings: Settings) {
  enableToggle.checked = settings.enabled;
  deeplApiKey.value = settings.deeplApiKey;
  deeplIsFree.checked = settings.deeplIsFree ?? true;
  microsoftApiKey.value = settings.microsoftApiKey;
  microsoftRegion.value = settings.microsoftRegion || 'global';
  primaryEngine.value = settings.primaryEngine || 'deepl';
  fallbackEngine.value = settings.fallbackEngine || 'microsoft';
  sourceLang.value = settings.sourceLang || 'en';
  targetLang.value = settings.targetLang || 'ko';
  displayMode.value = settings.displayMode || 'parallel';
  batchSize.value = String(settings.batchSize || 10);
}

/**
 * 설정 저장
 */
async function handleSave() {
  try {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    const newSettings: Partial<Settings> = {
      enabled: enableToggle.checked,
      deeplApiKey: deeplApiKey.value,
      deeplIsFree: deeplIsFree.checked,
      microsoftApiKey: microsoftApiKey.value,
      microsoftRegion: microsoftRegion.value,
      primaryEngine: primaryEngine.value as any,
      fallbackEngine: fallbackEngine.value as any,
      sourceLang: sourceLang.value,
      targetLang: targetLang.value,
      displayMode: displayMode.value as any,
      batchSize: parseInt(batchSize.value) || 10,
    };

    await chrome.runtime.sendMessage({
      type: 'updateSettings',
      data: newSettings,
    });

    showStatus('설정이 저장되었습니다', 'success');
    saveButton.textContent = 'Save';
    saveButton.disabled = false;

    // 캐시 통계 새로고침
    loadCacheStats();
  } catch (error) {
    console.error('[Popup] Save error:', error);
    showStatus('설정 저장에 실패했습니다', 'error');
    saveButton.textContent = 'Save';
    saveButton.disabled = false;
  }
}

/**
 * 캐시 통계 로드
 */
async function loadCacheStats() {
  try {
    const stats = await chrome.runtime.sendMessage({
      type: 'getCacheStats',
    });

    if (stats && cacheStatsDiv) {
      cacheStatsDiv.innerHTML = `
        <div>
          <p><strong>Cache Stats:</strong></p>
          <ul>
            <li>Memory: ${stats.memorySize} items</li>
            <li>Hit Rate: ${stats.hitRate}%</li>
            <li>Total Requests: ${stats.totalRequests}</li>
            <li>Cached: ${stats.cachedRequests}</li>
          </ul>
        </div>
      `;
    }
  } catch (error) {
    console.warn('[Popup] Failed to load cache stats:', error);
  }
}

/**
 * 상태 메시지 표시
 */
function showStatus(message: string, type: 'success' | 'error' | 'info') {
  if (!statusDiv) return;

  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';

  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

/**
 * 초기화 실행
 */
document.addEventListener('DOMContentLoaded', init);
