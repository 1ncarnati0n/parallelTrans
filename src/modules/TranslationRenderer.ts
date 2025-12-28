/**
 * Translation Renderer Module
 * 번역 결과를 DOM에 렌더링하는 담당
 */

import { DisplayMode, CONSTANTS } from '../types';
import { TextChunk } from './TextExtractor';

export class TranslationRenderer {
  private readonly originalTexts = new WeakMap<Text, string>();
  private readonly translatedNodes = new Set<Text>();
  private readonly appendedTranslations = new WeakMap<Text, HTMLSpanElement>();

  /**
   * 텍스트 노드에 번역 결과를 적용
   */
  renderTranslation(textNode: Text, chunks: TextChunk[], displayMode: DisplayMode, targetLang: string): boolean {
    const parent = textNode.parentElement;
    if (!parent) return false;
    // textNode가 document 내에 있거나, 이미 wrapper 안에 있는 경우(isConnected)
    if (!textNode.isConnected) return false;

    const allTranslated = chunks.every(chunk => typeof chunk.translation === 'string');
    if (!allTranslated) return false;

    if (!this.originalTexts.has(textNode)) {
      this.originalTexts.set(textNode, textNode.textContent ?? '');
    }

    const originalText = this.originalTexts.get(textNode) ?? '';
    const translatedText = this.buildTranslatedText(chunks);

    if (displayMode === 'parallel') {
      textNode.textContent = originalText;
      this.upsertParallelTranslation(textNode, translatedText, targetLang);
    } else {
      this.removeParallelTranslation(textNode);
      textNode.textContent = translatedText || originalText;
    }

    this.translatedNodes.add(textNode);

    return true;
  }

  /**
   * 번역 표시 제거 및 원문 복원
   */
  removeTranslations(): void {
    // 추적된 노드 복원
    this.translatedNodes.forEach((node) => {
      const original = this.originalTexts.get(node);
      if (original !== undefined) {
        node.textContent = original;
      }
      this.removeParallelTranslation(node);
    });
    this.translatedNodes.clear();

    // 안전망: 추적되지 않은 번역 요소 전체 정리
    this.cleanupOrphanedTranslations();
  }

  /**
   * 추적되지 않은 번역 요소 정리 (안전망)
   */
  private cleanupOrphanedTranslations(): void {
    // wrapper 요소 정리
    const wrappers = document.querySelectorAll('.parallel-trans-wrapper');
    wrappers.forEach(wrapper => {
      // 텍스트 노드만 남기고 wrapper 제거
      const parent = wrapper.parentNode;
      if (parent) {
        while (wrapper.firstChild) {
          // 번역 span과 br은 제거하고 텍스트 노드 등은 부모로 이동
          const child = wrapper.firstChild;
          if (child instanceof HTMLElement &&
              (child.classList.contains('parallel-trans-inline') ||
               child.classList.contains('parallel-trans-br'))) {
            child.remove();
          } else {
            parent.insertBefore(child, wrapper);
          }
        }
        wrapper.remove();
      }
    });

    // 남은 번역 span 및 br 제거
    const orphans = document.querySelectorAll('.parallel-trans-inline, .parallel-trans-br');
    orphans.forEach(el => el.remove());
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

  private upsertParallelTranslation(textNode: Text, translatedText: string, targetLang: string): void {
    if (!translatedText) {
      this.removeParallelTranslation(textNode);
      return;
    }

    let span = this.appendedTranslations.get(textNode);

    // Wrapper 및 Span 생성 또는 갱신
    if (!span) {
      // 1. Wrapper 생성
      const wrapper = document.createElement('span');
      wrapper.className = 'parallel-trans-wrapper';
      wrapper.dataset.parallelTrans = 'wrapper';
      // 레이아웃 영향 최소화를 위한 스타일
      wrapper.style.display = 'inline';
      
      // 2. 번역 Span 생성
      span = document.createElement('span');
      span.className = 'parallel-trans-inline';
      span.dataset.parallelTrans = 'inline';
      
      const parent = textNode.parentNode;
      if (!parent) return;

      // 3. DOM 구조 변경: TextNode -> Wrapper(TextNode + BR + Span)
      parent.replaceChild(wrapper, textNode);
      wrapper.appendChild(textNode);

      // 줄바꿈을 위한 <br> 태그 추가
      const br = document.createElement('br');
      br.className = 'parallel-trans-br';
      wrapper.appendChild(br);

      wrapper.appendChild(span);

      this.appendedTranslations.set(textNode, span);
    }

    // 텍스트 및 속성 업데이트 (줄바꿈 후 번역 표시)
    span.textContent = translatedText;
    span.lang = targetLang;
    span.setAttribute('aria-label', 'Translation');
  }

  private removeParallelTranslation(textNode: Text): void {
    const span = this.appendedTranslations.get(textNode);
    if (span) {
      const wrapper = span.parentElement;
      // Wrapper 구조인지 확인하고 복원
      if (wrapper && wrapper.classList.contains('parallel-trans-wrapper') && wrapper.parentNode) {
        wrapper.parentNode.replaceChild(textNode, wrapper);
      } else {
        // Wrapper가 없는 경우 (예외적 상황)
        span.remove();
      }
      this.appendedTranslations.delete(textNode);
    }
  }
}

