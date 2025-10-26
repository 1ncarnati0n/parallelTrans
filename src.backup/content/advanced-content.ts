/**
 * Advanced Content Script
 * - Viewport-based translation
 * - MutationObserver for dynamic content
 * - Smart batch processing
 * - Improved performance
 */

import { Settings, TranslationRequest, BatchTranslationRequest } from '../types';

interface TranslationNode {
  node: Node;
  text: string;
  translated: boolean;
  inViewport: boolean;
}

let settings: Settings;
let isTranslationActive = false;
let translationNodes: Map<string, TranslationNode> = new Map();
let pendingNodes: TranslationNode[] = [];
let mutationObserver: MutationObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;

const nodeIdMap = new WeakMap<Node, string>();
let nodeCounter = 0;

/**
 * 초기화
 */
async function init() {
  try {
    console.log('[ParallelTrans] Content script loading...');

    settings = await chrome.runtime.sendMessage({ type: 'getSettings' });

    if (!settings.enabled) {
      console.log('[ParallelTrans] Extension disabled');
      return;
    }

    // 키보드 단축키
    document.addEventListener('keydown', handleShortcut);

    // 설정 변경 리스너
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'settingsUpdated') {
        settings = message.settings;
        console.log('[ParallelTrans] Settings updated');
      } else if (message.type === 'translationToggled') {
        isTranslationActive = message.enabled;
        console.log(`[ParallelTrans] Translation ${message.enabled ? 'enabled' : 'disabled'}`);
      }
    });

    setupMutationObserver();
    setupIntersectionObserver();

    console.log('[ParallelTrans] Content script initialized');
  } catch (error) {
    console.error('[ParallelTrans] Initialization error:', error);
  }
}

/**
 * 단축키 핸들러
 */
function handleShortcut(e: KeyboardEvent) {
  // Option+A: 번역 토글
  if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    toggleTranslation();
  }

  // Option+Q: 표시 모드 토글
  if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'q') {
    e.preventDefault();
    toggleDisplayMode();
  }
}

/**
 * 번역 토글
 */
async function toggleTranslation() {
  if (!settings.enabled) {
    console.log('[ParallelTrans] Translation disabled in settings');
    return;
  }

  isTranslationActive = !isTranslationActive;

  if (isTranslationActive) {
    console.log('[ParallelTrans] Translation activated');
    await translatePage();
  } else {
    console.log('[ParallelTrans] Translation deactivated');
    removeAllTranslations();
  }
}

/**
 * 표시 모드 토글
 */
function toggleDisplayMode() {
  if (!isTranslationActive) {
    console.log('[ParallelTrans] No active translation');
    return;
  }

  settings.displayMode = settings.displayMode === 'parallel' ? 'translation-only' : 'parallel';
  console.log(`[ParallelTrans] Display mode: ${settings.displayMode}`);

  removeAllTranslations();
  translatePage();
}

/**
 * Mutation Observer 설정 (동적 콘텐츠 감지)
 */
function setupMutationObserver() {
  const mutationCallback = (mutations: MutationRecord[]) => {
    if (!isTranslationActive) return;

    console.log(`[ParallelTrans] Detected ${mutations.length} mutations`);

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // 새로운 노드 추가됨
        Array.from(mutation.addedNodes).forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text && text.length >= 3 && /[a-zA-Z]/.test(text)) {
              const newNode = createTranslationNode(node);
              if (newNode) {
                pendingNodes.push(newNode);
              }
            }
          }
        });
      }
    }

    // 배치 처리 큐에 추가
    if (pendingNodes.length > 0) {
      processPendingNodes();
    }
  };

  mutationObserver = new MutationObserver(mutationCallback);
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  });
}

/**
 * Intersection Observer 설정 (Viewport 기반 번역)
 */
function setupIntersectionObserver() {
  const callback = (entries: IntersectionObserverEntry[]) => {
    if (!isTranslationActive) return;

    for (const entry of entries) {
      const node = entry.target;
      const nodeId = getNodeId(node);

      const translationNode = translationNodes.get(nodeId);
      if (translationNode) {
        translationNode.inViewport = entry.isIntersecting;

        // Viewport에 들어온 항목을 우선 번역
        if (entry.isIntersecting && !translationNode.translated) {
          pendingNodes.push(translationNode);
        }
      }
    }

    processPendingNodes();
  };

  intersectionObserver = new IntersectionObserver(callback, {
    threshold: 0.1,
  });
}

/**
 * 노드 ID 생성/조회
 */
function getNodeId(node: Node): string {
  if (!nodeIdMap.has(node)) {
    nodeIdMap.set(node, `node-${nodeCounter++}`);
  }
  return nodeIdMap.get(node)!;
}

/**
 * 번역 노드 생성
 */
function createTranslationNode(node: Node): TranslationNode | null {
  const text = node.textContent?.trim();

  if (!text || text.length < 3 || !/[a-zA-Z]/.test(text)) {
    return null;
  }

  const nodeId = getNodeId(node);

  if (translationNodes.has(nodeId)) {
    return translationNodes.get(nodeId) || null;
  }

  const translationNode: TranslationNode = {
    node,
    text,
    translated: false,
    inViewport: false,
  };

  translationNodes.set(nodeId, translationNode);

  // Viewport 감시 추가
  if (intersectionObserver) {
    const parent = node.parentElement;
    if (parent) {
      intersectionObserver.observe(parent);
    }
  }

  return translationNode;
}

/**
 * 페이지 번역
 */
async function translatePage() {
  console.log('[ParallelTrans] Starting page translation');

  const textNodes = getTextNodes(document.body);
  console.log(`[ParallelTrans] Found ${textNodes.length} text nodes`);

  // 번역 노드 생성
  for (const node of textNodes) {
    const translationNode = createTranslationNode(node);
    if (translationNode) {
      pendingNodes.push(translationNode);
    }
  }

  // 배치 처리
  await processPendingNodes();

  console.log('[ParallelTrans] Translation complete');
}

/**
 * 대기 중인 노드 처리 (배치)
 */
async function processPendingNodes() {
  if (pendingNodes.length === 0) return;

  console.log(`[ParallelTrans] Processing ${pendingNodes.length} pending nodes`);

  const batchSize = settings.batchSize || 10;

  // 배치 크기별로 나누어 처리
  while (pendingNodes.length > 0) {
    const batch = pendingNodes.splice(0, batchSize);
    const texts = batch.map((n) => n.text);

    try {
      // 배치 번역 요청
      const result = await chrome.runtime.sendMessage({
        type: 'batchTranslate',
        data: {
          texts,
          sourceLang: settings.sourceLang,
          targetLang: settings.targetLang,
        } as BatchTranslationRequest,
      });

      if (result.success && result.translations) {
        // 번역 결과 적용
        batch.forEach((translationNode, index) => {
          if (result.translations?.[index]) {
            insertTranslation(translationNode.node, result.translations[index]);
            translationNode.translated = true;

            const nodeId = getNodeId(translationNode.node);
            translationNodes.set(nodeId, translationNode);
          }
        });
      } else {
        console.warn('[ParallelTrans] Batch translation failed:', result.error);
      }
    } catch (error) {
      console.error('[ParallelTrans] Batch processing error:', error);
    }

    // 배치 간 딜레이 (레이트 제한 고려)
    await delay(100);
  }
}

/**
 * 텍스트 노드 추출
 */
function getTextNodes(root: Node): Node[] {
  const nodes: Node[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      // 제외 태그
      const excluded = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'];
      if (excluded.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;

      // 번역 요소 제외
      if (parent.closest('.parallel-trans-translation, .parallel-trans-wrapper')) {
        return NodeFilter.FILTER_REJECT;
      }

      // React 앱 제외
      let element: HTMLElement | null = parent;
      while (element) {
        if (
          element.hasAttribute('data-reactroot') ||
          element.id?.startsWith('react-') ||
          element.hasAttribute('data-react-') ||
          Object.keys(element).some((key) => key.startsWith('__react'))
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        element = element.parentElement;
      }

      const text = node.textContent?.trim() || '';
      return text.length >= 3 && /[a-zA-Z]/.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  return nodes;
}

/**
 * 번역 삽입
 */
function insertTranslation(node: Node, translation: string) {
  const parent = node.parentElement;
  if (!parent) return;

  if (settings.displayMode === 'parallel') {
    // 병렬 표기
    const span = document.createElement('span');
    span.className = 'parallel-trans-translation';
    span.textContent = ` [${translation}]`;
    span.style.color = '#0066cc';
    span.style.fontSize = '0.9em';

    if (node.nextSibling) {
      parent.insertBefore(span, node.nextSibling);
    } else {
      parent.appendChild(span);
    }
  } else {
    // 번역만 표시
    const wrapper = document.createElement('span');
    wrapper.className = 'parallel-trans-wrapper';
    wrapper.setAttribute('data-original', node.textContent || '');
    wrapper.textContent = translation;
    wrapper.style.cursor = 'pointer';
    wrapper.title = node.textContent || '';

    parent.replaceChild(wrapper, node);
  }
}

/**
 * 모든 번역 제거
 */
function removeAllTranslations() {
  document.querySelectorAll('.parallel-trans-translation').forEach((el) => el.remove());

  document.querySelectorAll('.parallel-trans-wrapper').forEach((wrapper) => {
    const parent = wrapper.parentElement;
    const original = wrapper.getAttribute('data-original');
    if (parent && original) {
      parent.replaceChild(document.createTextNode(original), wrapper);
    }
  });

  // 상태 초기화
  translationNodes.forEach((node) => {
    node.translated = false;
  });
}

/**
 * 딜레이 유틸리티
 */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 초기화 실행
 */
init();
