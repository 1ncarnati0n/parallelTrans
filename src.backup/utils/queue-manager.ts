/**
 * 배치 번역 큐 매니저
 * - 우선순위 기반 큐
 * - 배치 자동 병합
 * - 재시도 로직
 */

import { QueueItem, TranslationEngine } from '../types';
import { Logger } from './logger';

export class QueueManager {
  private queue: QueueItem[] = [];
  private processingQueue: Set<string> = new Set();
  private readonly maxQueueSize = 1000;

  constructor() {}

  /**
   * 큐에 항목 추가
   */
  enqueue(item: QueueItem): void {
    if (this.queue.length >= this.maxQueueSize) {
      Logger.warn('Queue', 'Queue is full, discarding item');
      return;
    }

    // 중복 확인 (같은 텍스트 + 언어)
    const isDuplicate = this.queue.some(
      (q) =>
        q.engine === item.engine &&
        q.sourceLang === item.sourceLang &&
        q.targetLang === item.targetLang &&
        JSON.stringify(q.texts.sort()) === JSON.stringify(item.texts.sort())
    );

    if (isDuplicate) {
      Logger.debug('Queue', 'Duplicate item found, skipping');
      return;
    }

    this.queue.push(item);
    this.sort();
    Logger.debug('Queue', `Item enqueued. Queue size: ${this.queue.length}`);
  }

  /**
   * 여러 항목 일괄 추가
   */
  enqueueBatch(items: QueueItem[]): void {
    for (const item of items) {
      this.enqueue(item);
    }
  }

  /**
   * 우선순위 기반 정렬
   */
  private sort(): void {
    this.queue.sort((a, b) => {
      // 우선순위 높은 순서
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 같은 우선순위면 먼저 들어온 것 우선
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * 큐에서 다음 항목 가져오기
   */
  dequeue(): QueueItem | null {
    if (this.queue.length === 0) {
      return null;
    }
    return this.queue.shift() || null;
  }

  /**
   * 엔진별 다음 항목 가져오기
   */
  dequeueByEngine(engine: TranslationEngine): QueueItem | null {
    const index = this.queue.findIndex((item) => item.engine === engine);
    if (index === -1) {
      return null;
    }
    return this.queue.splice(index, 1)[0];
  }

  /**
   * 처리 시작
   */
  startProcessing(itemId: string): void {
    this.processingQueue.add(itemId);
    Logger.debug('Queue', `Started processing: ${itemId}`);
  }

  /**
   * 처리 완료
   */
  completeProcessing(itemId: string): void {
    this.processingQueue.delete(itemId);
    Logger.debug('Queue', `Completed processing: ${itemId}`);
  }

  /**
   * 처리 중인 항목 확인
   */
  isProcessing(itemId: string): boolean {
    return this.processingQueue.has(itemId);
  }

  /**
   * 큐 크기 반환
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * 처리 대기 항목 수
   */
  pendingCount(): number {
    return this.queue.length + this.processingQueue.size;
  }

  /**
   * 큐 비우기
   */
  clear(): void {
    this.queue = [];
    Logger.info('Queue', 'Queue cleared');
  }

  /**
   * 엔진별 항목 수 조회
   */
  countByEngine(engine: TranslationEngine): number {
    return this.queue.filter((item) => item.engine === engine).length;
  }

  /**
   * 큐 상태 조회
   */
  getStatus(): {
    queueSize: number;
    processingCount: number;
    totalPending: number;
    engines: Record<TranslationEngine, number>;
  } {
    return {
      queueSize: this.queue.length,
      processingCount: this.processingQueue.size,
      totalPending: this.pendingCount(),
      engines: {
        deepl: this.countByEngine('deepl'),
        microsoft: this.countByEngine('microsoft'),
      },
    };
  }

  /**
   * 재시도 필요한 항목 확인
   */
  getRetryItems(): QueueItem[] {
    return this.queue.filter(
      (item) => item.retryCount < item.maxRetries
    );
  }

  /**
   * 항목 우선순위 업데이트
   */
  updatePriority(itemId: string, newPriority: number): boolean {
    const item = this.queue.find((q) => q.id === itemId);
    if (!item) {
      return false;
    }
    item.priority = newPriority;
    this.sort();
    return true;
  }

  /**
   * 실패한 항목 처리
   */
  handleFailure(itemId: string, error: Error): QueueItem | null {
    const item = this.queue.find((q) => q.id === itemId);
    if (!item) {
      return null;
    }

    item.retryCount++;

    if (item.retryCount >= item.maxRetries) {
      Logger.error('Queue', `Item ${itemId} exceeded max retries`, error);
      // 큐에서 제거
      const index = this.queue.indexOf(item);
      if (index !== -1) {
        this.queue.splice(index, 1);
      }
      return null;
    }

    // 재시도 항목은 우선순위 감소
    item.priority = Math.max(0, item.priority - 1);
    this.sort();

    Logger.warn(
      'Queue',
      `Item ${itemId} will be retried (${item.retryCount}/${item.maxRetries})`
    );

    return item;
  }
}

export const queueManager = new QueueManager();
