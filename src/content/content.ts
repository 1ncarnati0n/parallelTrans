/**
 * Content Script - 웹페이지에 주입되어 실시간 번역 수행
 * 업그레이드: Option+A 단축키, 병행표기/번역만 모드
 */

import { Settings } from '../types';

let settings: Settings;
let isTranslating = false;
const translatedNodes = new WeakSet<Node>();
const originalTexts = new WeakMap<HTMLElement, string>();

/**
 * 초기화
 */
async function init() {
  console.log('ParallelTrans: Content script loaded');

  // 설정 가져오기
  settings = await getSettings();

  // 자동 번역 모드면 바로 시작
  if (settings.enabled && settings.triggerMode === 'auto') {
    startTranslation();
  }

  // 키보드 단축키 리스너 (Option+A 또는 Alt+A)
  document.addEventListener('keydown', handleKeyboardShortcut);

  // 메시지 리스너
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'translationToggled') {
      settings.enabled = message.enabled;
      if (settings.enabled && settings.triggerMode === 'auto') {
        startTranslation();
      } else if (!settings.enabled) {
        removeAllTranslations();
      }
    }
  });
}

/**
 * 설정 가져오기
 */
async function getSettings(): Promise<Settings> {
  const response = await chrome.runtime.sendMessage({ type: 'getSettings' });
  return response;
}

/**
 * 키보드 단축키 핸들러
 */
function handleKeyboardShortcut(event: KeyboardEvent) {
  // Option+A (Mac) 또는 Alt+A (Windows)
  if ((event.altKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    
    if (!settings.enabled) {
      console.log('ParallelTrans: Translation is disabled');
      return;
    }

    // 수동 모드일 때만 작동
    if (settings.triggerMode === 'manual') {
      console.log('ParallelTrans: Manual translation triggered (Option+A)');
      startTranslation();
    }
  }
}

/**
 * 번역 시작
 */
function startTranslation() {
  if (isTranslating) {
    console.log('ParallelTrans: Translation already in progress');
    return;
  }
  
  isTranslating = true;

  // 페이지 로드 완료 후 번역
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => translatePage());
  } else {
    translatePage();
  }

  // 동적 콘텐츠 감지 (자동 모드일 때만)
  if (settings.triggerMode === 'auto') {
    observeDOM();
  }
}

/**
 * 페이지 전체 번역
 */
async function translatePage() {
  console.log('ParallelTrans: Starting translation...');

  const textNodes = getTextNodes(document.body);
  const batchSize = 10;

  for (let i = 0; i < textNodes.length; i += batchSize) {
    const batch = textNodes.slice(i, i + batchSize);
    await Promise.all(batch.map(node => translateNode(node)));
    await delay(100);
  }

  console.log('ParallelTrans: Translation completed');
  isTranslating = false;
}

/**
 * 텍스트 노드 추출
 */
function getTextNodes(element: Node): Node[] {
  const textNodes: Node[] = [];

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (translatedNodes.has(node)) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // 제외할 태그
        const excludedTags = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'];
        if (excludedTags.includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        // 번역 태그 제외
        if (parent.classList.contains('parallel-trans-translation') || 
            parent.classList.contains('parallel-trans-wrapper')) {
          return NodeFilter.FILTER_REJECT;
        }

        // 의미있는 텍스트인지 확인
        const text = node.textContent?.trim() || '';
        if (text.length < 3) {
          return NodeFilter.FILTER_REJECT;
        }

        // 영어 텍스트인지 확인
        if (!containsEnglish(text)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  return textNodes;
}

/**
 * 영어 포함 여부 확인
 */
function containsEnglish(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

/**
 * 개별 노드 번역
 */
async function translateNode(node: Node) {
  const text = node.textContent?.trim();
  if (!text) return;

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'translate',
      data: {
        text: text,
        sourceLang: settings.sourceLang,
        targetLang: settings.targetLang
      }
    });

    if (result.success && result.translation) {
      insertTranslation(node, result.translation);
      translatedNodes.add(node);
    }
  } catch (error) {
    console.error('Translation error:', error);
  }
}

/**
 * 번역 텍스트 삽입
 */
function insertTranslation(node: Node, translation: string) {
  const parent = node.parentElement;
  if (!parent) return;

  const originalText = node.textContent || '';

  if (settings.displayMode === 'parallel') {
    // 병행 표기 모드: 원문 [번역문]
    insertParallelTranslation(node, parent, translation);
  } else {
    // 번역만 모드: 원문 숨기고 번역문만 표시
    insertTranslationOnly(node, parent, originalText, translation);
  }
}

/**
 * 병행 표기 모드
 */
function insertParallelTranslation(node: Node, parent: HTMLElement, translation: string) {
  // 번역 span 요소 생성
  const translationSpan = document.createElement('span');
  translationSpan.className = 'parallel-trans-translation';
  translationSpan.textContent = translation;
  translationSpan.setAttribute('data-original', node.textContent || '');

  // 원문 노드 다음에 번역 삽입
  if (node.nextSibling) {
    parent.insertBefore(document.createTextNode(' '), node.nextSibling);
    parent.insertBefore(translationSpan, node.nextSibling);
  } else {
    parent.appendChild(document.createTextNode(' '));
    parent.appendChild(translationSpan);
  }
}

/**
 * 번역만 표시 모드
 */
function insertTranslationOnly(node: Node, parent: HTMLElement, originalText: string, translation: string) {
  // 원본 텍스트 저장 (복원을 위해)
  originalTexts.set(parent, originalText);

  // 래퍼 생성
  const wrapper = document.createElement('span');
  wrapper.className = 'parallel-trans-wrapper';
  
  // 원문 (숨김)
  const originalSpan = document.createElement('span');
  originalSpan.className = 'parallel-trans-original';
  originalSpan.textContent = originalText;
  originalSpan.style.display = 'none';
  
  // 번역문 (표시)
  const translationSpan = document.createElement('span');
  translationSpan.className = 'parallel-trans-translation-only';
  translationSpan.textContent = translation;
  translationSpan.setAttribute('data-original', originalText);
  
  wrapper.appendChild(originalSpan);
  wrapper.appendChild(translationSpan);
  
  // 텍스트 노드를 래퍼로 교체
  parent.replaceChild(wrapper, node);
}

/**
 * DOM 변화 감지
 */
function observeDOM() {
  const observer = new MutationObserver((mutations) => {
    if (!settings.enabled || settings.triggerMode !== 'auto') return;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const textNodes = getTextNodes(node);
            textNodes.forEach(textNode => translateNode(textNode));
          }
        });
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * 모든 번역 제거
 */
function removeAllTranslations() {
  // 병행 표기 번역 제거
  const translations = document.querySelectorAll('.parallel-trans-translation');
  translations.forEach(el => el.remove());

  // 번역만 모드 래퍼 제거 및 원문 복원
  const wrappers = document.querySelectorAll('.parallel-trans-wrapper');
  wrappers.forEach(wrapper => {
    const parent = wrapper.parentElement;
    const originalSpan = wrapper.querySelector('.parallel-trans-original');
    if (parent && originalSpan && originalSpan.textContent) {
      const textNode = document.createTextNode(originalSpan.textContent);
      parent.replaceChild(textNode, wrapper);
    }
  });

  // WeakSet 초기화는 불가능하므로 새로 번역 가능
  console.log('ParallelTrans: All translations removed');
}

/**
 * 딜레이 함수
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 초기화 실행
init();
