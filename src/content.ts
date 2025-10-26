/**
 * Content Script
 */

import { Settings, BatchTranslationRequest } from './types';

let settings: Settings | null = null;
let isActive = false;
const translatedNodes = new WeakSet<Node>();
const pendingTexts: { node: Node; text: string }[] = [];
let mutationObserver: MutationObserver | null = null;
let processingTimer: number | null = null;

// ============== 초기화 ==============
function initSettings() {
  // 기본 설정 (Background에서 설정 가져오면 덮어씀)
  settings = {
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

  // Background에서 설정 가져오기
  chrome.runtime.sendMessage({ type: 'getSettings' }, (response) => {
    if (response && !chrome.runtime.lastError) {
      settings = response;
      console.log('[ParallelTrans] Settings loaded:', settings);
    }
  });
}

function init() {
  try {
    initSettings();

    document.addEventListener('keydown', handleKeydown);
    chrome.runtime.onMessage.addListener(handleMessage);
    setupMutationObserver();

    console.log('[ParallelTrans] ✅ Content script ready');
  } catch (error) {
    console.error('[ParallelTrans] Init error:', error);
  }
}

// ============== 토스트 메시지 ==============
function showToast(message: string) {
  const toast = document.createElement('div');
  toast.id = 'parallel-trans-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #222;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slide-in 0.3s ease;
  `;

  // 애니메이션 CSS 추가
  if (!document.getElementById('parallel-trans-styles')) {
    const style = document.createElement('style');
    style.id = 'parallel-trans-styles';
    style.textContent = `
      @keyframes slide-in {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2000);
}

// ============== 단축키 ==============
function handleKeydown(e: KeyboardEvent) {
  if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    isActive = !isActive;
    const message = isActive ? '✅ 번역 ON' : '❌ 번역 OFF';
    showToast(message);
    console.log(`[ParallelTrans] ${message}`);

    if (isActive) {
      translatePage();
    } else {
      removeTranslations();
    }
  }

  if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'q') {
    if (!settings) return;
    e.preventDefault();
    settings.displayMode = settings.displayMode === 'parallel' ? 'translation-only' : 'parallel';
    const mode = settings.displayMode === 'parallel' ? '병렬 표기' : '번역만';
    showToast(`📝 모드: ${mode}`);
    removeTranslations();
    if (isActive) translatePage();
  }
}

// ============== 메시지 핸들러 ==============
function handleMessage(message: any) {
  if (message.type === 'settingsUpdated') {
    settings = message.settings;
  }
}

// ============== Mutation Observer ==============
function setupMutationObserver() {
  mutationObserver = new MutationObserver((mutations) => {
    if (!isActive) return;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        Array.from(mutation.addedNodes).forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text && text.length >= 3 && /[a-zA-Z]/.test(text)) {
              pendingTexts.push({ node, text });
            }
          }
        });
      }
    }

    if (pendingTexts.length > 0) {
      scheduleProcessing();
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============== 페이지 번역 ==============
function translatePage() {
  if (!settings) {
    console.warn('[ParallelTrans] Settings not ready');
    return;
  }

  const textNodes = getTextNodes(document.body);
  console.log(`[ParallelTrans] Found ${textNodes.length} nodes`);

  pendingTexts.push(...textNodes.map(node => ({
    node,
    text: node.textContent?.trim() || '',
  })));

  scheduleProcessing();
}

function scheduleProcessing() {
  if (processingTimer !== null) return;

  processingTimer = window.setTimeout(async () => {
    processingTimer = null;
    await processPendingTexts();
  }, 100);
}

async function processPendingTexts() {
  if (!settings) {
    console.warn('[ParallelTrans] Settings not ready for processing');
    return;
  }

  while (pendingTexts.length > 0) {
    const batch = pendingTexts.splice(0, settings.batchSize);
    const texts = batch.map(b => b.text);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'batchTranslate',
        data: {
          texts,
          sourceLang: settings.sourceLang,
          targetLang: settings.targetLang,
        } as BatchTranslationRequest,
      });

      if (result.success && result.translations) {
        batch.forEach((item, idx) => {
          if (result.translations?.[idx]) {
            insertTranslation(item.node, result.translations[idx]);
            translatedNodes.add(item.node);
          }
        });
      }
    } catch (error) {
      console.warn('[ParallelTrans] Batch error:', error);
    }

    await delay(50);
  }
}

// ============== 텍스트 노드 추출 ==============
function getTextNodes(root: Node): Node[] {
  const nodes: Node[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      const element = node as Element;
      const excluded = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'IFRAME'];

      if (excluded.includes(element.tagName)) return NodeFilter.FILTER_REJECT;
      if (element.closest('.parallel-trans-wrapper, .parallel-trans-trans')) {
        return NodeFilter.FILTER_REJECT;
      }

      // 자식 요소가 있으면 계속 탐색
      if (element.children.length > 0) {
        return NodeFilter.FILTER_SKIP;
      }

      // 텍스트만 있는 요소 수락
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    const element = node as Element;
    const text = element.textContent?.trim() || '';

    // 유효한 텍스트만 추가
    if (text.length >= 3 && /[a-zA-Z]/.test(text)) {
      nodes.push(element);
    }
  }
  return nodes;
}

// ============== 번역 삽입 ==============
function insertTranslation(node: Node, translation: string) {
  if (!settings) return;

  const element = node as Element;
  if (!element.parentElement) return;

  if (settings.displayMode === 'parallel') {
    // 병렬 표기: 요소 뒤에 번역 텍스트 추가
    const span = document.createElement('span');
    span.className = 'parallel-trans-trans';
    span.textContent = ` [${translation}]`;
    span.style.cssText = 'color: #0066cc; font-size: 0.9em; margin-left: 4px;';

    element.parentElement.insertBefore(span, element.nextSibling);
  } else {
    // 번역만: 요소의 textContent만 번역으로 교체
    const wrapper = document.createElement('span');
    wrapper.className = 'parallel-trans-wrapper';
    wrapper.textContent = translation;
    wrapper.title = element.textContent || '';
    wrapper.style.cssText = 'cursor: pointer; border-bottom: 1px dotted blue;';

    element.parentElement.replaceChild(wrapper, element);
  }
}

function removeTranslations() {
  document.querySelectorAll('.parallel-trans-trans').forEach(el => el.remove());

  document.querySelectorAll('.parallel-trans-wrapper').forEach((wrapper: any) => {
    const parent = wrapper.parentElement;
    if (parent) {
      parent.replaceChild(document.createTextNode(wrapper.title), wrapper);
    }
  });
}

// ============== 유틸리티 ==============
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============== 실행 ==============
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
