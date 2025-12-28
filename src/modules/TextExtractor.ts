/**
 * Text Extractor Module
 * 텍스트 노드 추출 및 문장 분할 담당
 */

import { CONSTANTS } from '../types';

export interface SentenceInfo {
  text: string;
  startIndex: number;
  endIndex: number;
}

export interface TextNodeSegment {
  node: Text;
  text: string;
  sentences: SentenceInfo[];
}

export interface TextChunk {
  text: string;
  startIndex: number;
  endIndex: number;
  translation?: string;
}

/**
 * 텍스트 노드 추출 및 처리 클래스
 */
export class TextExtractor {
  private readonly excludedTags = new Set<string>(CONSTANTS.EXCLUDED_ELEMENTS);
  private readonly nodeIds = new WeakMap<Text, string>();
  private nodeIdCounter = 0;

  /**
   * 루트 노드에서 텍스트 노드들을 추출하고 문장 단위로 분할
   */
  extractTextNodes(root: Node, translatedNodeKeys: Set<string>): TextNodeSegment[] {
    const segments: TextNodeSegment[] = [];

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const textNode = node as Text;

          const parent = textNode.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          for (let el: Element | null = parent; el; el = el.parentElement) {
            if (this.excludedTags.has(el.tagName)) {
              return NodeFilter.FILTER_REJECT;
            }
            // 번역 요소 내부는 제외 (중복 번역 방지)
            if (el.hasAttribute('data-parallel-trans')) {
              return NodeFilter.FILTER_REJECT;
            }
          }

          const textContent = textNode.textContent?.trim() || '';
          // 유니코드 문자 클래스를 사용하여 모든 언어의 문자 감지
          if (textContent.length >= CONSTANTS.MIN_TEXT_LENGTH && /\p{L}/u.test(textContent)) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        },
      }
    );

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (!node) continue;

      const nodeKey = this.getNodeKey(node);
      if (translatedNodeKeys.has(nodeKey)) continue;

      const text = node.textContent?.trim() || '';
      if (!text) continue;

      const sentences = this.splitIntoSentences(text);
      if (sentences.length > 0) {
        segments.push({ node, text, sentences });
      }
    }

    return segments;
  }

  /**
   * 텍스트를 문장 단위로 분할 (위치 정보 포함)
   * Intl.Segmenter 사용 (Chrome 87+)
   */
  splitIntoSentences(text: string): SentenceInfo[] {
    // 1. Intl.Segmenter 사용 시도 (정확도 높음)
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
        const segments = Array.from(segmenter.segment(text)) as Intl.SegmentData[];
        const sentences: SentenceInfo[] = [];

        for (const segment of segments) {
          const rawText = segment.segment;
          const trimmedText = rawText.trim();

          if (trimmedText.length >= CONSTANTS.MIN_TEXT_LENGTH) {
            // trim된 텍스트의 실제 시작 위치 계산
            const leadingSpaceCount = rawText.indexOf(trimmedText);
            const startIndex = segment.index + leadingSpaceCount;
            const endIndex = startIndex + trimmedText.length;

            sentences.push({
              text: trimmedText,
              startIndex,
              endIndex,
            });
          }
        }

        if (sentences.length > 0) {
          return sentences;
        }
      } catch (e) {
        console.warn('[TextExtractor] Intl.Segmenter failed, falling back to regex', e);
      }
    }

    // 2. Fallback: 정규식 기반 분할 (CJK 문장 부호 추가)
    // 문장 구분자: . ! ? 。 ？！ 및 줄바꿈
    const sentenceEndRegex = /([.!?。？！]+[\s\n\r]+|[\n\r]+)/g;
    const sentences: SentenceInfo[] = [];
    let lastIndex = 0;
    let match;

    while ((match = sentenceEndRegex.exec(text)) !== null) {
      const endPos = match.index + match[1].length;
      const sentenceText = text.substring(lastIndex, endPos).trim();

      if (sentenceText.length >= CONSTANTS.MIN_TEXT_LENGTH) {
        // 원본 텍스트에서 실제 시작 위치 찾기
        const actualStart = text.indexOf(sentenceText, lastIndex);
        sentences.push({
          text: sentenceText,
          startIndex: actualStart >= 0 ? actualStart : lastIndex,
          endIndex: actualStart >= 0 ? actualStart + sentenceText.length : endPos,
        });
      }
      lastIndex = endPos;
    }

    const lastSentenceText = text.substring(lastIndex).trim();
    if (lastSentenceText.length >= CONSTANTS.MIN_TEXT_LENGTH) {
      const actualStart = text.indexOf(lastSentenceText, lastIndex);
      sentences.push({
        text: lastSentenceText,
        startIndex: actualStart >= 0 ? actualStart : lastIndex,
        endIndex: actualStart >= 0 ? actualStart + lastSentenceText.length : text.length,
      });
    }

    // 문장이 없으면 전체 텍스트를 하나의 문장으로
    if (sentences.length === 0) {
      return [{ text, startIndex: 0, endIndex: text.length }];
    }

    return sentences;
  }

  /**
   * 문장들을 의미 단위로 그룹화 (스마트 청킹)
   * API 제한을 고려하여 적절한 크기로 묶음
   */
  smartChunking(sentences: SentenceInfo[]): SentenceInfo[][] {
    const chunks: SentenceInfo[][] = [];
    let currentChunk: SentenceInfo[] = [];
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.text.length;

      if (
        currentLength + sentenceLength + 1 <= CONSTANTS.MAX_CHUNK_LENGTH &&
        currentChunk.length < CONSTANTS.MAX_CHUNK_SENTENCES
      ) {
        currentChunk.push(sentence);
        currentLength += sentenceLength + 1;
      } else {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }
        currentChunk = [sentence];
        currentLength = sentenceLength;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [sentences];
  }

  /**
   * 텍스트 노드의 고유 키 생성 (구조적 경로 + 내부 ID)
   */
  getNodeKey(node: Text): string {
    const parent = node.parentElement;
    if (!parent) return '';
    const path: string[] = [];
    let current: Element | null = parent;
    while (current && current !== document.body) {
      // 번역 wrapper 요소는 경로에서 제외 (nodeKey 일관성 유지)
      if (current.hasAttribute('data-parallel-trans')) {
        current = current.parentElement;
        continue;
      }

      const tag = current.tagName.toLowerCase();

      const rawId = typeof current.getAttribute === 'function'
        ? current.getAttribute('id')
        : null;
      const id = rawId ? `#${rawId}` : '';

      let classToken = '';
      if (typeof current.getAttribute === 'function') {
        const rawClass = current.getAttribute('class');
        if (rawClass) {
          classToken = rawClass.trim().split(/\s+/)[0] || '';
        }
      } else if (typeof (current as HTMLElement).className === 'string') {
        classToken = (current as HTMLElement).className.trim().split(/\s+/)[0] || '';
      }
      const className = classToken ? `.${classToken}` : '';

      path.unshift(tag + id + className);
      current = current.parentElement;
    }
    const nodeId = this.getOrCreateNodeId(node);
    return `${path.join('>')}::${nodeId}`;
  }

  /**
   * 세그먼트에서 청크 정보 생성
   * 문장의 위치 정보를 직접 사용하여 정확한 매핑 보장
   */
  createChunks(segment: TextNodeSegment): TextChunk[] {
    const chunks = this.smartChunking(segment.sentences);
    const chunkInfos: TextChunk[] = [];

    for (const sentenceGroup of chunks) {
      if (sentenceGroup.length === 0) continue;

      // 청크 텍스트 생성 (문장들을 공백으로 연결)
      const chunkText = sentenceGroup.map(s => s.text).join(' ').trim();

      if (chunkText && chunkText.length >= CONSTANTS.MIN_TEXT_LENGTH) {
        // 첫 문장의 시작 위치와 마지막 문장의 끝 위치 사용
        const startIndex = sentenceGroup[0].startIndex;
        const endIndex = sentenceGroup[sentenceGroup.length - 1].endIndex;

        chunkInfos.push({ text: chunkText, startIndex, endIndex });
      }
    }

    return chunkInfos;
  }

  private getOrCreateNodeId(node: Text): string {
    let id = this.nodeIds.get(node);
    if (!id) {
      this.nodeIdCounter += 1;
      id = `n${this.nodeIdCounter}`;
      this.nodeIds.set(node, id);
    }
    return id;
  }
}

