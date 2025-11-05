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
    
    // 페이지 언로드 시 정리
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
  // Option+A (Mac: altKey, Windows: altKey) - Cmd는 제외
  if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    isActive = !isActive;
    const message = isActive ? '✅ 번역 ON' : '❌ 번역 OFF';
    styleManager.showToast(message);
    console.log(`[ParallelTrans] ${message}`);

    if (isActive) {
      translatePage();
    } else {
      removeTranslations();
    }
  }

  // Option+Q (Mac: altKey, Windows: altKey) - 표시 모드 전환
  if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'q') {
    if (!settings) return;
    e.preventDefault();
    settings.displayMode = settings.displayMode === 'parallel' ? 'translation-only' : 'parallel';
    const mode = settings.displayMode === 'parallel' ? '병렬 표기' : '번역만';
    styleManager.showToast(`📝 모드: ${mode}`);
    removeTranslations();
    if (isActive) translatePage();
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
          // 번역 결과를 청크 정보에 저장
          batch.forEach((item, idx) => {
            if (result.translations?.[idx]) {
              const chunks = nodeChunksMap.get(item.node);
              if (chunks) {
                // 해당 청크 찾아서 번역 결과 저장
                const chunk = chunks.find(c => 
                  c.text === item.text && 
                  c.startIndex === item.startIndex && 
                  c.endIndex === item.endIndex
                );
                if (chunk) {
                  chunk.translation = result.translations[idx];
                }
              }
            }
          });
          
          // 텍스트 노드별로 모든 청크 번역이 완료되었는지 확인하고 삽입
          const processedNodes = new Set<Text>();
          batch.forEach((item) => {
            if (!processedNodes.has(item.node)) {
              processNodeTranslations(item.node);
              processedNodes.add(item.node);
            }
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
/**
 * 텍스트 노드의 모든 청크 번역 처리
 * 모든 청크가 번역 완료되었을 때만 DOM 조작 수행
 */
function processNodeTranslations(textNode: Text): void {
  if (!settings || !textNode.parentElement) return;
  
  const nodeKey = textExtractor.getNodeKey(textNode);
  if (translatedTexts.has(nodeKey)) return;
  
  const chunks = nodeChunksMap.get(textNode);
  if (!chunks || chunks.length === 0) return;
  
  const rendered = translationRenderer.renderTranslation(
    textNode,
    chunks,
    settings.displayMode
  );

  if (!rendered) {
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
