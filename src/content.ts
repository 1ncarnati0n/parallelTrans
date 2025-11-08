/**
 * Content Script
 * 번역 관리 및 DOM 조작의 중앙 제어
 */

import { Settings, BatchTranslationRequest, CONSTANTS, Message, SettingsUpdatedMessage } from './types';
import { TextExtractor, TextChunk, TextNodeSegment } from './modules/TextExtractor';
import { TranslationRenderer } from './modules/TranslationRenderer';
import { StyleManager } from './modules/StyleManager';

// ============== 상태 관리 ==============
let settings: Settings | null = null;
let isActive = false;
let isProcessing = false; // Race condition 방지

// 번역된 텍스트 노드 추적 (부모 요소 + 텍스트 내용 기반)
// LRU 방식으로 메모리 관리
const translatedTexts = new Map<string, number>(); // key -> timestamp
const pendingTexts: { node: Text; text: string; originalText: string; startIndex: number; endIndex: number }[] = [];
// 텍스트 노드별 청크 그룹화
const nodeChunksMap = new Map<Text, TextChunk[]>();

let mutationObserver: MutationObserver | null = null;
let processingTimer: number | null = null;

// ============== 모듈 인스턴스 ==============
const textExtractor = new TextExtractor();
const translationRenderer = new TranslationRenderer();
const styleManager = new StyleManager();
let hydrationSettled = false;
let hydrationWaitPromise: Promise<void> | null = null;

const HYDRATION_SELECTOR_LIST = [
  '[data-reactroot]',
  '[data-reactid]',
  '[data-nextjs-scroll-state]',
  '[data-nextjs-router]',
  '[data-sveltekit-hydrate]',
  '[data-v-app]',
  '[data-solidroot]',
  '[ng-version]',
];

// ============== 초기화 ==============
async function initSettings(): Promise<void> {
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
    cacheEnabled: true,
    viewportTranslation: true,
  };

  // Background에서 설정 가져오기 (비동기 대기)
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getSettings' } as Message);
    if (response && !chrome.runtime.lastError) {
      settings = response as Settings;
      console.log('[ParallelTrans] Settings loaded:', settings);
    }
  } catch (error) {
    console.warn('[ParallelTrans] Failed to load settings:', error);
  }
}

async function init() {
  try {
    await initSettings();
    styleManager.injectStyles();

    document.addEventListener('keydown', handleKeydown);
    chrome.runtime.onMessage.addListener(handleMessage);
    setupMutationObserver();
    window.addEventListener('beforeunload', cleanup);

    console.log('[ParallelTrans] ✅ Content script ready');
  } catch (error) {
    console.error('[ParallelTrans] Init error:', error);
  }
}

// ============== 정리 ==============
function cleanup() {
  // 메모리 정리
  translatedTexts.clear();
  nodeChunksMap.clear();
  pendingTexts.length = 0;

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  if (processingTimer !== null) {
    clearTimeout(processingTimer);
    processingTimer = null;
  }
}

// ============== 단축키 ==============
function handleKeydown(e: KeyboardEvent) {
  const isAltOnly = e.altKey && !e.metaKey && !e.ctrlKey;
  const key = (e.key || '').toLowerCase();
  const code = e.code || '';

  // Option+A (Mac: altKey, Windows: altKey) - Cmd는 제외
  if (
    isAltOnly &&
    (code === 'KeyA' || key === 'a' || key === 'ㅁ')
  ) {
    e.preventDefault();
    isActive = !isActive;
    const message = isActive ? '✅ 번역 ON' : '❌ 번역 OFF';
    styleManager.showToast(message);
    console.log(`[ParallelTrans] ${message}`);

    if (isActive) {
      void activateTranslations();
    } else {
      removeTranslations();
    }
  }

  // Option+Q (Mac: altKey, Windows: altKey) - 표시 모드 전환
  if (
    isAltOnly &&
    (code === 'KeyQ' || key === 'q' || key === 'ㅂ')
  ) {
    if (!settings) return;
    e.preventDefault();
    settings.displayMode = settings.displayMode === 'parallel' ? 'translation-only' : 'parallel';
    const mode = settings.displayMode === 'parallel' ? '병렬 표기' : '번역만';
    styleManager.showToast(`📝 모드: ${mode}`);
    removeTranslations();
    if (isActive) void activateTranslations();
  }
}

// ============== 메시지 핸들러 ==============
function handleMessage(message: Message): void {
  if (message.type === 'settingsUpdated') {
    const settingsMessage = message as SettingsUpdatedMessage;
    settings = settingsMessage.settings;
    console.log('[ParallelTrans] Settings updated:', settings);

    // 번역이 활성화되어 있으면 다시 번역
    if (isActive) {
      removeTranslations();
      translatePage();
    }
  }
}

// ============== Mutation Observer ==============
function setupMutationObserver() {
  mutationObserver = new MutationObserver((mutations) => {
    if (!hydrationSettled) return;
    if (!isActive) return;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        Array.from(mutation.addedNodes).forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            processNewTextNode(node as Text);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            processNewElement(node as Element);
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

function processNewTextNode(textNode: Text): void {
  if (!hydrationSettled) return;
  const nodeKey = textExtractor.getNodeKey(textNode);
  if (translatedTexts.has(nodeKey)) return;

  cleanupTranslatedTexts();

  const text = textNode.textContent?.trim() || '';
  if (text && text.length >= CONSTANTS.MIN_TEXT_LENGTH && /[a-zA-Z]/.test(text)) {
    const segment: TextNodeSegment = {
      node: textNode,
      text,
      sentences: textExtractor.splitIntoSentences(text),
    };
    processSegment(segment);
  }
}

function processNewElement(element: Element): void {
  if (!hydrationSettled) return;
  const excludedTags = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'IFRAME'];
  if (excludedTags.includes(element.tagName)) return;

  const translatedNodeKeys = new Set(translatedTexts.keys());
  const segments = textExtractor.extractTextNodes(element, translatedNodeKeys);

  segments.forEach(segment => {
    cleanupTranslatedTexts();
    processSegment(segment);
  });
}

function processSegment(segment: TextNodeSegment): void {
  const nodeKey = textExtractor.getNodeKey(segment.node);
  if (translatedTexts.has(nodeKey)) return;

  const chunkInfos = textExtractor.createChunks(segment);

  if (chunkInfos.length > 0) {
    nodeChunksMap.set(segment.node, chunkInfos);

    chunkInfos.forEach(chunk => {
      addPendingText(segment.node, chunk.text, segment.text, chunk.startIndex, chunk.endIndex);
    });
  }
}

// ============== 페이지 번역 ==============
function translatePage() {
  if (!hydrationSettled) {
    return;
  }
  if (!settings) {
    console.warn('[ParallelTrans] Settings not ready');
    return;
  }

  const translatedNodeKeys = new Set(translatedTexts.keys());
  const segments = textExtractor.extractTextNodes(document.body, translatedNodeKeys);
  console.log(`[ParallelTrans] Found ${segments.length} text segments`);

  // 각 텍스트 노드의 문장들을 스마트하게 청킹하여 번역 큐에 추가
  segments.forEach(segment => {
    const chunkInfos = textExtractor.createChunks(segment);

    if (chunkInfos.length > 0) {
      nodeChunksMap.set(segment.node, chunkInfos);

      chunkInfos.forEach(chunk => {
        addPendingText(segment.node, chunk.text, segment.text, chunk.startIndex, chunk.endIndex);
      });
    }
  });

  scheduleProcessing();
}

/**
 * translatedTexts Map 크기 제한 및 오래된 항목 제거
 */
function cleanupTranslatedTexts(): void {
  if (translatedTexts.size <= CONSTANTS.MAX_TRANSLATED_NODES) {
    return;
  }

  // 가장 오래된 항목들 제거 (50% 제거)
  const entries = Array.from(translatedTexts.entries())
    .sort((a, b) => a[1] - b[1]); // timestamp 기준 정렬

  const removeCount = Math.floor(entries.length / 2);
  for (let i = 0; i < removeCount; i++) {
    translatedTexts.delete(entries[i][0]);
  }

  console.log(`[ParallelTrans] Cleaned up ${removeCount} old translated nodes`);
}

/**
 * pendingTexts에 항목 추가 (메모리 누수 방지)
 */
function addPendingText(node: Text, text: string, originalText: string, startIndex: number, endIndex: number): void {
  // 이미 번역된 텍스트 노드는 스킵
  const nodeKey = textExtractor.getNodeKey(node);
  if (translatedTexts.has(nodeKey)) return;

  pendingTexts.push({ node, text, originalText, startIndex, endIndex });

  // 메모리 누수 방지: 최대 크기 제한
  if (pendingTexts.length > CONSTANTS.MAX_PENDING_TEXTS) {
    const removeCount = pendingTexts.length - CONSTANTS.MAX_PENDING_TEXTS;
    pendingTexts.splice(0, removeCount);
    console.warn(`[ParallelTrans] Pending texts overflow, removed ${removeCount} oldest items`);
  }
}

function scheduleProcessing() {
  if (!hydrationSettled) return;
  if (processingTimer !== null) return;

  processingTimer = window.setTimeout(async () => {
    processingTimer = null;
    await processPendingTexts();
  }, CONSTANTS.BATCH_PROCESSING_DELAY_MS);
}

/**
 * Race condition 방지를 위한 처리
 */
async function processPendingTexts() {
  if (!hydrationSettled) return;
  if (!settings) {
    console.warn('[ParallelTrans] Settings not ready for processing');
    return;
  }

  // Race condition 방지
  if (isProcessing) {
    console.log('[ParallelTrans] Already processing, skipping');
    return;
  }

  isProcessing = true;

  try {
    while (pendingTexts.length > 0) {
      const batch = pendingTexts.splice(0, CONSTANTS.DEFAULT_BATCH_SIZE);
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
          const processedNodes = new Set<Text>();

          batch.forEach((item, idx) => {
            const translatedText = result.translations?.[idx];
            if (!translatedText) return;

            const chunks = nodeChunksMap.get(item.node);
            if (!chunks) return;

            const chunk = chunks.find(c =>
              c.text === item.text &&
              c.startIndex === item.startIndex &&
              c.endIndex === item.endIndex
            );
            if (chunk) {
              chunk.translation = translatedText;
            }
          });

          batch.forEach((item) => {
            if (processedNodes.has(item.node)) return;
            processedNodes.add(item.node);
            processNodeTranslations(item.node);
          });
        } else if (result.error) {
          console.warn('[ParallelTrans] Batch error:', result.error);
        }
      } catch (error) {
        console.warn('[ParallelTrans] Batch error:', error);
      }

      await delay(CONSTANTS.BATCH_INTERVAL_DELAY_MS);
    }
  } finally {
    isProcessing = false;
  }
}

// ============== 번역 삽입 ==============
function processNodeTranslations(textNode: Text): void {
  if (!hydrationSettled) return;
  if (!settings || !textNode.parentElement) return;

  const nodeKey = textExtractor.getNodeKey(textNode);
  if (translatedTexts.has(nodeKey)) return;

  // 노드가 여전히 DOM에 존재하는지 확인
  if (!document.contains(textNode)) {
    console.warn('[ParallelTrans] Node no longer in DOM, skipping');
    return;
  }

  const chunks = nodeChunksMap.get(textNode);
  if (!chunks || chunks.length === 0) return;

  const success = translationRenderer.renderTranslation(textNode, chunks, settings.displayMode);
  if (!success) {
    return;
  }

  translatedTexts.set(nodeKey, Date.now());
  nodeChunksMap.delete(textNode);
}

function removeTranslations(): void {
  translationRenderer.removeTranslations();

  // 추적 정보 초기화
  translatedTexts.clear();
  nodeChunksMap.clear();
  pendingTexts.length = 0;
}

async function activateTranslations(): Promise<void> {
  await ensureHydrationSettled();
  translatePage();
}

function pageLikelyHydrating(): boolean {
  return HYDRATION_SELECTOR_LIST.some((selector) => document.querySelector(selector));
}

async function ensureHydrationSettled(): Promise<void> {
  if (hydrationSettled) return;

  if (!pageLikelyHydrating()) {
    hydrationSettled = true;
    return;
  }

  if (!hydrationWaitPromise) {
    hydrationWaitPromise = waitForHydrationGrace();
  }

  await hydrationWaitPromise;
  hydrationSettled = true;
}

async function waitForHydrationGrace(): Promise<void> {
  if (document.readyState !== 'complete') {
    await new Promise<void>((resolve) => {
      window.addEventListener('load', () => resolve(), { once: true });
    });
  }
  await delay(CONSTANTS.HYDRATION_GRACE_PERIOD_MS);
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
