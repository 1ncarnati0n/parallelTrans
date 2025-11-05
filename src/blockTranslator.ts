/**
 * Block-level Translation Module
 * 블록 단위로 번역을 처리하고 DOM 구조를 유지합니다
 */

import { CONSTANTS } from './types';

// ============== 인터페이스 ==============

interface BlockInfo {
  element: Element;
  fullText: string;
  textNodes: TextNodeInfo[];
}

interface TextNodeInfo {
  node: Text;
  text: string;
  startOffset: number;
  endOffset: number;
}

interface TranslationMapping {
  original: string;
  translation: string;
  startOffset: number;
  endOffset: number;
}

// ============== DOM 스냅샷 관리 ==============

export class DOMSnapshot {
  private snapshots = new Map<Element, string>();

  save(element: Element): void {
    this.snapshots.set(element, element.innerHTML);
  }

  restore(element: Element): boolean {
    const snapshot = this.snapshots.get(element);
    if (snapshot) {
      element.innerHTML = snapshot;
      element.classList.remove('parallel-trans-block');
      return true;
    }
    return false;
  }

  clear(): void {
    this.snapshots.clear();
  }

  has(element: Element): boolean {
    return this.snapshots.has(element);
  }
}

// ============== 블록 감지 ==============

export class BlockDetector {
  /**
   * 번역 가능한 블록 요소들을 찾습니다
   */
  findTranslatableBlocks(root: Element | Document): Element[] {
    const blocks: Element[] = [];
    const blockSelector = CONSTANTS.BLOCK_ELEMENTS.join(',');
    const excludedSelector = CONSTANTS.EXCLUDED_ELEMENTS.join(',');

    // 블록 요소 찾기
    const candidates = root.querySelectorAll(blockSelector);

    candidates.forEach((element) => {
      // 제외할 요소 확인
      if (this.shouldExcludeElement(element, excludedSelector)) {
        return;
      }

      // 이미 번역된 블록은 스킵
      if (element.classList.contains('parallel-trans-block')) {
        return;
      }

      // 영문 텍스트가 있는지 확인
      const text = this.extractText(element);
      if (text.length >= CONSTANTS.MIN_TEXT_LENGTH && /[a-zA-Z]/.test(text)) {
        blocks.push(element);
      }
    });

    return blocks;
  }

  private shouldExcludeElement(element: Element, excludedSelector: string): boolean {
    // 제외 요소 내부인지 확인
    if (element.closest(excludedSelector)) {
      return true;
    }

    // 자식에 제외 요소만 있는지 확인
    const excludedChildren = element.querySelectorAll(excludedSelector);
    if (excludedChildren.length > 0) {
      // 제외 요소 외에 다른 텍스트가 있는지 확인
      const textContent = element.textContent?.trim() || '';
      let excludedText = '';
      excludedChildren.forEach((child) => {
        excludedText += child.textContent || '';
      });
      return textContent === excludedText.trim();
    }

    return false;
  }

  private extractText(element: Element): string {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const textNode = node as Text;
          const text = textNode.textContent?.trim() || '';
          return text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      }
    );

    let fullText = '';
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      fullText += node.textContent || '';
    }

    return fullText.trim();
  }
}

// ============== 텍스트 추출 ==============

export class BlockTextExtractor {
  /**
   * 블록에서 모든 텍스트 노드를 추출하고 위치 정보를 기록합니다
   */
  extractBlockText(element: Element): BlockInfo {
    const textNodes: TextNodeInfo[] = [];
    let currentOffset = 0;

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const textNode = node as Text;
          const parent = textNode.parentElement;

          // 제외할 요소 내부는 스킵
          if (parent && (CONSTANTS.EXCLUDED_ELEMENTS as readonly string[]).includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          const text = textNode.textContent || '';
          return text.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      }
    );

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || '';
      const startOffset = currentOffset;
      const endOffset = currentOffset + text.length;

      textNodes.push({
        node,
        text,
        startOffset,
        endOffset,
      });

      currentOffset = endOffset;
    }

    const fullText = textNodes.map((n) => n.text).join('');

    return {
      element,
      fullText,
      textNodes,
    };
  }
}

// ============== 번역 적용 ==============

export class TranslationApplier {
  /**
   * 번역 결과를 DOM에 적용합니다 (구조 유지)
   */
  applyTranslation(
    blockInfo: BlockInfo,
    translation: string,
    displayMode: 'parallel' | 'translation-only'
  ): void {
    const { textNodes, fullText } = blockInfo;

    if (displayMode === 'parallel') {
      this.applyParallelMode(blockInfo, translation);
    } else {
      this.applyTranslationOnlyMode(textNodes, fullText, translation);
    }

    // 블록 스타일 적용
    blockInfo.element.classList.add('parallel-trans-block');
  }

  private applyParallelMode(blockInfo: BlockInfo, translation: string): void {
    // 블록 끝에 번역문 추가
    const translationNode = document.createElement('div');
    translationNode.className = 'parallel-trans-inline';
    translationNode.textContent = `[${translation}]`;
    translationNode.style.cssText = 'margin-top: 4px; font-style: italic;';

    blockInfo.element.appendChild(translationNode);
  }

  private applyTranslationOnlyMode(
    textNodes: TextNodeInfo[],
    originalText: string,
    translation: string
  ): void {
    // 원문과 번역문의 길이 비율 계산
    const ratio = translation.length / originalText.length;

    textNodes.forEach((nodeInfo) => {
      const { node, startOffset, endOffset } = nodeInfo;

      // 이 텍스트 노드에 해당하는 번역 부분 추출
      const translationStart = Math.floor(startOffset * ratio);
      const translationEnd = Math.floor(endOffset * ratio);
      const nodeTranslation = translation.substring(translationStart, translationEnd);

      // 텍스트 노드 내용만 교체 (DOM 구조 유지)
      node.textContent = nodeTranslation;
    });
  }

  /**
   * 블록에서 번역 제거
   */
  removeTranslation(element: Element): void {
    // parallel-trans-inline 요소 제거
    const inlineElements = element.querySelectorAll('.parallel-trans-inline');
    inlineElements.forEach((el) => el.remove());

    // 블록 스타일 제거
    element.classList.remove('parallel-trans-block');
  }
}
