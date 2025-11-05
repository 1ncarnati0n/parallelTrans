/**
 * Content Script
 */

import { Settings, BatchTranslationRequest, CONSTANTS, Message, SettingsUpdatedMessage } from './types';

let settings: Settings | null = null;
let isActive = false;
let isProcessing = false; // Race condition 방지
// 번역된 텍스트 노드 추적 (부모 요소 + 텍스트 내용 기반)
// LRU 방식으로 메모리 관리
const translatedTexts = new Map<string, number>(); // key -> timestamp
const pendingTexts: { node: Text; text: string; originalText: string; startIndex: number; endIndex: number }[] = [];
// 텍스트 노드별 청크 그룹화
const nodeChunksMap = new Map<Text, { text: string; startIndex: number; endIndex: number; translation?: string }[]>();
let mutationObserver: MutationObserver | null = null;
let processingTimer: number | null = null;


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
  // Option+A (Mac: altKey, Windows: altKey) - Cmd는 제외
  if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'a') {
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

  // Option+Q (Mac: altKey, Windows: altKey) - 표시 모드 전환
  if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'q') {
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
            const textNode = node as Text;
            const nodeKey = getNodeKey(textNode);
            if (translatedTexts.has(nodeKey)) return;
            
            // 메모리 정리 필요 시 수행
            cleanupTranslatedTexts();
            
            const text = textNode.textContent?.trim() || '';
            if (text && text.length >= CONSTANTS.MIN_TEXT_LENGTH && /[a-zA-Z]/.test(text)) {
              const sentences = splitIntoSentences(text);
              const chunks = smartChunking(sentences);
              const chunkInfos: { text: string; startIndex: number; endIndex: number }[] = [];
              let currentIndex = 0;
              
              chunks.forEach(chunk => {
                const chunkText = chunk.join(' ').trim();
                if (chunkText && chunkText.length >= CONSTANTS.MIN_TEXT_LENGTH) {
                  const startIndex = text.indexOf(chunkText, currentIndex);
                  if (startIndex !== -1) {
                    const endIndex = startIndex + chunkText.length;
                    chunkInfos.push({ text: chunkText, startIndex, endIndex });
                    currentIndex = endIndex;
                    addPendingText(textNode, chunkText, text, startIndex, endIndex);
                  }
                }
              });
              
              if (chunkInfos.length > 0) {
                nodeChunksMap.set(textNode, chunkInfos);
              }
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            // 새로 추가된 요소 내부의 텍스트 노드도 처리
            const element = node as Element;
            const excludedTags = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'IFRAME'];
            if (!excludedTags.includes(element.tagName)) {
              const segments = getTextNodes(element);
              segments.forEach(segment => {
                const nodeKey = getNodeKey(segment.node);
                if (translatedTexts.has(nodeKey)) return;
                
                // 메모리 정리 필요 시 수행
                cleanupTranslatedTexts();
                
                const chunks = smartChunking(segment.sentences);
                const chunkInfos: { text: string; startIndex: number; endIndex: number }[] = [];
                let currentIndex = 0;
                
                chunks.forEach(chunk => {
                  const chunkText = chunk.join(' ').trim();
                  if (chunkText && chunkText.length >= CONSTANTS.MIN_TEXT_LENGTH) {
                    const startIndex = segment.text.indexOf(chunkText, currentIndex);
                    if (startIndex !== -1) {
                      const endIndex = startIndex + chunkText.length;
                      chunkInfos.push({ text: chunkText, startIndex, endIndex });
                      currentIndex = endIndex;
                      addPendingText(segment.node, chunkText, segment.text, startIndex, endIndex);
                    }
                  }
                });
                
                if (chunkInfos.length > 0) {
                  nodeChunksMap.set(segment.node, chunkInfos);
                }
              });
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

  const segments = getTextNodes(document.body);
  console.log(`[ParallelTrans] Found ${segments.length} text segments`);

  // 각 텍스트 노드의 문장들을 스마트하게 청킹하여 번역 큐에 추가
  segments.forEach(segment => {
    // 이미 번역된 텍스트 노드는 스킵
    const nodeKey = getNodeKey(segment.node);
    if (translatedTexts.has(nodeKey)) return;
    
    // 문장들을 의미 단위로 그룹화
    const chunks = smartChunking(segment.sentences);
    
    // 청크의 정확한 위치 정보 계산
    const chunkInfos: { text: string; startIndex: number; endIndex: number }[] = [];
    let currentIndex = 0;
    
    chunks.forEach(chunk => {
      const chunkText = chunk.join(' ').trim();
      if (chunkText && chunkText.length >= CONSTANTS.MIN_TEXT_LENGTH) {
        // 원본 텍스트에서 청크의 정확한 위치 찾기
        const startIndex = segment.text.indexOf(chunkText, currentIndex);
        if (startIndex !== -1) {
          const endIndex = startIndex + chunkText.length;
          chunkInfos.push({ text: chunkText, startIndex, endIndex });
          currentIndex = endIndex;
          
          addPendingText(segment.node, chunkText, segment.text, startIndex, endIndex);
        }
      }
    });
    
    // 텍스트 노드별 청크 정보 저장
    if (chunkInfos.length > 0) {
      nodeChunksMap.set(segment.node, chunkInfos);
    }
  });

  scheduleProcessing();
}

/**
 * 문장들을 의미 단위로 그룹화 (스마트 청킹)
 * API 제한을 고려하여 적절한 크기로 묶음
 */
function smartChunking(sentences: string[]): string[][] {
  const chunks: string[][] = [];
  const maxChunkLength = 500; // API 제한 고려
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;
    
    // 현재 청크에 추가할 수 있는지 확인
    if (currentLength + sentenceLength + 1 <= maxChunkLength && currentChunk.length < 5) {
      // 공백 고려하여 길이 계산
      currentChunk.push(sentence);
      currentLength += sentenceLength + 1;
    } else {
      // 현재 청크 저장하고 새 청크 시작
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = [sentence];
      currentLength = sentenceLength;
    }
  }

  // 마지막 청크 추가
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [sentences];
}

/**
 * 텍스트 노드의 고유 키 생성 (부모 요소 + 텍스트 내용 기반)
 */
function getNodeKey(node: Text): string {
  const parent = node.parentElement;
  if (!parent) return '';
  // 부모 요소의 경로와 텍스트 내용을 조합하여 고유 키 생성
  const path: string[] = [];
  let current: Element | null = parent;
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : '';
    const className = current.className ? `.${current.className.split(' ')[0]}` : '';
    path.unshift(tag + id + className);
    current = current.parentElement;
  }
  return `${path.join('>')}:${node.textContent?.substring(0, 50) || ''}`;
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
  const nodeKey = getNodeKey(node);
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

// ============== 텍스트 노드 추출 ==============
interface TextNodeSegment {
  node: Text;
  text: string;
  sentences: string[];
}

/**
 * 실제 텍스트 노드를 추출하고 문장 단위로 분할
 */
function getTextNodes(root: Node): TextNodeSegment[] {
  const segments: TextNodeSegment[] = [];
  const excludedTags = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'IFRAME'];
  
  // TEXT_NODE만 추출하는 TreeWalker
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const textNode = node as Text;
        
        // 제외된 태그 내부의 텍스트 노드 스킵
        const parent = textNode.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        // 번역된 요소 내부 스킵
        if (parent.closest('.parallel-trans-wrapper, .parallel-trans-trans')) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // 제외된 태그 내부 스킵
        for (let el: Element | null = parent; el; el = el.parentElement) {
          if (excludedTags.includes(el.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
        }
        
        const text = textNode.textContent?.trim() || '';
        
        // 유효한 텍스트만 처리 (영문 포함, 최소 길이)
        if (text.length >= CONSTANTS.MIN_TEXT_LENGTH && /[a-zA-Z]/.test(text)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        
        return NodeFilter.FILTER_REJECT;
      },
    }
  );

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (!node) continue;
    
    // 이미 번역된 텍스트 노드는 스킵
    const nodeKey = getNodeKey(node);
    if (translatedTexts.has(nodeKey)) continue;
    
    // 메모리 정리 필요 시 수행
    cleanupTranslatedTexts();
    
    const text = node.textContent?.trim() || '';
    if (!text) continue;
    
    // 문장 단위로 분할
    const sentences = splitIntoSentences(text);
    
    if (sentences.length > 0) {
      segments.push({ node, text, sentences });
    }
  }
  
  return segments;
}

/**
 * 텍스트를 문장 단위로 분할
 * 문장 구분자: . ! ? 그리고 줄바꿈
 */
function splitIntoSentences(text: string): string[] {
  // 문장 구분자: . ! ? 줄바꿈
  // 다만 Mr., Dr., Inc. 같은 약어는 예외 처리
  const sentenceEndRegex = /([.!?]+\s+|[\n\r]+)/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sentenceEndRegex.exec(text)) !== null) {
    const sentence = text.substring(lastIndex, match.index + match[1].length).trim();
    if (sentence.length >= CONSTANTS.MIN_TEXT_LENGTH) {
      sentences.push(sentence);
    }
    lastIndex = match.index + match[1].length;
  }

  // 마지막 문장 처리
  const lastSentence = text.substring(lastIndex).trim();
  if (lastSentence.length >= CONSTANTS.MIN_TEXT_LENGTH) {
    sentences.push(lastSentence);
  }

  // 문장이 없으면 전체 텍스트 반환
  return sentences.length > 0 ? sentences : [text];
}

// ============== 번역 삽입 ==============
/**
 * 텍스트 노드의 모든 청크 번역 처리
 * 모든 청크가 번역 완료되었을 때만 DOM 조작 수행
 */
function processNodeTranslations(textNode: Text): void {
  if (!settings || !textNode.parentElement) return;
  
  const nodeKey = getNodeKey(textNode);
  if (translatedTexts.has(nodeKey)) return;
  
  // 노드가 여전히 DOM에 존재하는지 확인
  if (!document.contains(textNode)) {
    console.warn('[ParallelTrans] Node no longer in DOM, skipping');
    return;
  }
  
  const chunks = nodeChunksMap.get(textNode);
  if (!chunks || chunks.length === 0) return;
  
  // 모든 청크가 번역되었는지 확인
  const allTranslated = chunks.every(chunk => chunk.translation);
  if (!allTranslated) {
    // 아직 번역 중인 청크가 있으면 대기
    return;
  }
  
  // 청크를 시작 인덱스 순으로 정렬
  const sortedChunks = [...chunks].sort((a, b) => a.startIndex - b.startIndex);
  
  // 텍스트 노드를 한 번에 처리
  const fullText = textNode.textContent || '';
  const parent = textNode.parentElement;
  if (!parent) return;
  
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  
  sortedChunks.forEach((chunk, idx) => {
    // 청크 이전 텍스트 추가
    if (chunk.startIndex > lastIndex) {
      const beforeText = fullText.substring(lastIndex, chunk.startIndex);
      if (beforeText) {
        fragment.appendChild(document.createTextNode(beforeText));
      }
    }
    
    // 청크 번역 삽입
    if (settings!.displayMode === 'parallel') {
      // 병렬 표기: 원본 + 번역
      fragment.appendChild(document.createTextNode(chunk.text));
      const translationSpan = document.createElement('span');
      translationSpan.className = 'parallel-trans-trans';
      translationSpan.textContent = ` [${chunk.translation}]`;
      translationSpan.style.cssText = 'color: #0066cc; font-size: 0.9em; margin-left: 4px;';
      fragment.appendChild(translationSpan);
    } else {
      // 번역만: 번역으로 교체
      const wrapper = document.createElement('span');
      wrapper.className = 'parallel-trans-wrapper';
      wrapper.textContent = chunk.translation || '';
      wrapper.title = chunk.text;
      wrapper.style.cssText = 'cursor: pointer; border-bottom: 1px dotted blue;';
      fragment.appendChild(wrapper);
    }
    
    lastIndex = chunk.endIndex;
  });
  
  // 마지막 청크 이후 텍스트 추가
  if (lastIndex < fullText.length) {
    const afterText = fullText.substring(lastIndex);
    if (afterText) {
      fragment.appendChild(document.createTextNode(afterText));
    }
  }
  
  // 부모 노드가 여전히 존재하는지 최종 확인
  if (!parent.parentElement || !document.contains(parent)) {
    console.warn('[ParallelTrans] Parent node no longer in DOM, skipping replacement');
    return;
  }
  
  try {
    // 텍스트 노드 교체
    parent.replaceChild(fragment, textNode);
    
    // 번역 완료 표시 (타임스탬프 포함)
    translatedTexts.set(nodeKey, Date.now());
    nodeChunksMap.delete(textNode);
  } catch (error) {
    console.error('[ParallelTrans] Failed to replace text node:', error);
    // 노드가 이미 제거되었을 수 있음
  }
}


function removeTranslations(): void {
  // 번역 표시 제거
  document.querySelectorAll('.parallel-trans-trans').forEach(el => {
    try {
      el.remove();
    } catch (error) {
      console.warn('[ParallelTrans] Failed to remove translation element:', error);
    }
  });

  // 번역 래퍼를 원본 텍스트로 복원
  document.querySelectorAll('.parallel-trans-wrapper').forEach((wrapper) => {
    try {
      const parent = wrapper.parentElement;
      if (parent && document.contains(parent)) {
        const originalText = (wrapper as HTMLElement).getAttribute('title') || wrapper.textContent || '';
        parent.replaceChild(document.createTextNode(originalText), wrapper);
      }
    } catch (error) {
      console.warn('[ParallelTrans] Failed to restore original text:', error);
    }
  });
  
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
