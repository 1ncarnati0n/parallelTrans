/**
 * Translation Renderer Module
 * 번역 결과를 DOM에 렌더링하는 담당
 */

import { DisplayMode, CONSTANTS } from '../types';
import { TextChunk } from './TextExtractor';

export class TranslationRenderer {
  private readonly originalTexts = new WeakMap<Text, string>();
  private readonly translatedNodes = new Set<Text>();
  private readonly highlightedBlocks = new Set<Element>();
  private readonly appendedTranslations = new WeakMap<Text, HTMLSpanElement>();
  private readonly blockTags = new Set<string>(CONSTANTS.BLOCK_ELEMENTS);

  /**
   * 텍스트 노드에 번역 결과를 적용
   */
  renderTranslation(textNode: Text, chunks: TextChunk[], displayMode: DisplayMode): boolean {
    const parent = textNode.parentElement;
    if (!parent) return false;
    if (!document.contains(textNode)) return false;

    const allTranslated = chunks.every(chunk => typeof chunk.translation === 'string');
    if (!allTranslated) return false;

    if (!this.originalTexts.has(textNode)) {
      this.originalTexts.set(textNode, textNode.textContent ?? '');
    }

    const originalText = this.originalTexts.get(textNode) ?? '';
    const translatedText = this.buildTranslatedText(chunks);

    if (displayMode === 'parallel') {
      textNode.textContent = originalText;
      this.upsertParallelTranslation(textNode, translatedText);
    } else {
      this.removeParallelTranslation(textNode);
      textNode.textContent = translatedText || originalText;
    }

    this.translatedNodes.add(textNode);

    const block = this.findBlockElement(textNode);
    if (block && !this.highlightedBlocks.has(block)) {
      block.classList.add('parallel-trans-block');
      this.highlightedBlocks.add(block);
    }

    return true;
  }

  /**
   * 번역 표시 제거 및 원문 복원
   */
  removeTranslations(): void {
    // 추적된 노드 복원
    this.translatedNodes.forEach((node) => {
      const original = this.originalTexts.get(node);
      if (original !== undefined && node.isConnected) {
        node.textContent = original;
      }
      this.removeParallelTranslation(node);
    });
    this.translatedNodes.clear();

    // 블록 하이라이트 제거
    this.highlightedBlocks.forEach((block) => {
      if (block.isConnected) {
        block.classList.remove('parallel-trans-block');
      }
    });
    this.highlightedBlocks.clear();

    // 안전망: 추적되지 않은 번역 span도 전체 정리
    this.cleanupOrphanedTranslations();
  }

  /**
   * 추적되지 않은 번역 요소 정리 (안전망)
   */
  private cleanupOrphanedTranslations(): void {
    // data-parallel-trans 속성을 가진 모든 요소 제거
    const orphanedElements = document.querySelectorAll('[data-parallel-trans]');
    orphanedElements.forEach(el => el.remove());

    // parallel-trans-inline 클래스를 가진 요소도 정리
    const inlineElements = document.querySelectorAll('.parallel-trans-inline');
    inlineElements.forEach(el => el.remove());

    // parallel-trans-block 클래스 제거
    const blockElements = document.querySelectorAll('.parallel-trans-block');
    blockElements.forEach(el => el.classList.remove('parallel-trans-block'));
  }

  private buildTranslatedText(chunks: TextChunk[]): string {
    const sorted = [...chunks].sort((a, b) => a.startIndex - b.startIndex);
    const combined = sorted
      .map(chunk => chunk.translation ?? '')
      .join(' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return combined;
  }

  private findBlockElement(textNode: Text): Element | null {
    let current: Element | null = textNode.parentElement;
    while (current && current !== document.body) {
      if (this.blockTags.has(current.tagName)) {
        return current;
      }
      current = current.parentElement;
    }
    return textNode.parentElement;
  }

  private upsertParallelTranslation(textNode: Text, translatedText: string): void {
    const existing = this.appendedTranslations.get(textNode);

    if (!translatedText) {
      if (existing) {
        existing.remove();
        this.appendedTranslations.delete(textNode);
      }
      return;
    }

    if (existing) {
      existing.textContent = `[${translatedText}]`;
      return;
    }

    const span = document.createElement('span');
    span.className = 'parallel-trans-inline';
    span.textContent = `[${translatedText}]`;
    span.dataset.parallelTrans = 'inline';

    const parent = textNode.parentNode;
    if (!parent) return;

    if (textNode.nextSibling) {
      parent.insertBefore(span, textNode.nextSibling);
    } else {
      parent.appendChild(span);
    }

    this.appendedTranslations.set(textNode, span);
  }

  private removeParallelTranslation(textNode: Text): void {
    const span = this.appendedTranslations.get(textNode);
    if (span) {
      span.remove();
      this.appendedTranslations.delete(textNode);
    }
  }
}

