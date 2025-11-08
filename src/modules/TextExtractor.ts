/**
 * Text Extractor Module
 * 텍스트 노드 추출 및 문장 분할 담당
 */

import { CONSTANTS } from '../types';

export interface TextNodeSegment {
  node: Text;
  text: string;
  sentences: string[];
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
  private readonly excludedTags = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'IFRAME'];
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
            if (this.excludedTags.includes(el.tagName)) {
              return NodeFilter.FILTER_REJECT;
            }
          }

          const textContent = textNode.textContent?.trim() || '';
          if (textContent.length >= CONSTANTS.MIN_TEXT_LENGTH && /[a-zA-Z]/.test(textContent)) {
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
   * 텍스트를 문장 단위로 분할
   * 문장 구분자: . ! ? 그리고 줄바꿈
   */
  splitIntoSentences(text: string): string[] {
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

    const lastSentence = text.substring(lastIndex).trim();
    if (lastSentence.length >= CONSTANTS.MIN_TEXT_LENGTH) {
      sentences.push(lastSentence);
    }

    return sentences.length > 0 ? sentences : [text];
  }

  /**
   * 문장들을 의미 단위로 그룹화 (스마트 청킹)
   * API 제한을 고려하여 적절한 크기로 묶음
   */
  smartChunking(sentences: string[]): string[][] {
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.length;

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
   */
  createChunks(segment: TextNodeSegment): TextChunk[] {
    const chunks = this.smartChunking(segment.sentences);
    const chunkInfos: TextChunk[] = [];
    let currentIndex = 0;

    chunks.forEach(chunk => {
      const chunkText = chunk.join(' ').trim();
      if (chunkText && chunkText.length >= CONSTANTS.MIN_TEXT_LENGTH) {
        const startIndex = segment.text.indexOf(chunkText, currentIndex);
        if (startIndex !== -1) {
          const endIndex = startIndex + chunkText.length;
          chunkInfos.push({ text: chunkText, startIndex, endIndex });
          currentIndex = endIndex;
        }
      }
    });

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

