/**
 * 토큰 버킷 기반 레이트 제한 매니저
 * - DeepL Free: 5 req/sec
 * - Microsoft: 200 req/min
 * - 적응형 백오프 재시도 로직
 */

import { TranslationEngine, RateLimitConfig, RateLimitState } from '../types';
import { Logger } from './logger';

export class RateLimiter {
  private limitConfigs: Map<TranslationEngine, RateLimitConfig>;
  private states: Map<TranslationEngine, RateLimitState>;
  private pendingQueue: Map<TranslationEngine, Array<() => Promise<any>>>;

  constructor() {
    this.limitConfigs = new Map([
      ['deepl', {
        maxRequests: 5, // 5 requests per second
        windowMs: 1000,
        batchSize: 50, // DeepL 배치 최대 크기
      }],
      ['microsoft', {
        maxRequests: 200, // 200 requests per minute
        windowMs: 60000,
        batchSize: 25, // Microsoft 배치 최대 크기
      }],
    ]);

    this.states = new Map([
      ['deepl', {
        engine: 'deepl',
        tokens: 5,
        lastRefillTime: Date.now(),
        isLimited: false,
      }],
      ['microsoft', {
        engine: 'microsoft',
        tokens: 200,
        lastRefillTime: Date.now(),
        isLimited: false,
      }],
    ]);

    this.pendingQueue = new Map([
      ['deepl', []],
      ['microsoft', []],
    ]);

    // 주기적으로 토큰 리필
    this.startTokenRefill();
  }

  /**
   * 토큰 리필 루프
   */
  private startTokenRefill(): void {
    setInterval(() => {
      this.refillTokens();
    }, 100); // 100ms마다 토큰 체크
  }

  /**
   * 토큰 리필
   */
  private refillTokens(): void {
    const now = Date.now();

    for (const [engine, state] of this.states) {
      const config = this.limitConfigs.get(engine);
      if (!config) continue;

      const timePassed = now - state.lastRefillTime;
      const tokensToAdd = (timePassed / config.windowMs) * config.maxRequests;

      if (tokensToAdd > 0) {
        state.tokens = Math.min(config.maxRequests, state.tokens + tokensToAdd);
        state.lastRefillTime = now;
        state.isLimited = state.tokens < 1;
      }

      // 토큰이 충분하면 펜딩 큐 처리
      if (state.tokens >= 1 && this.pendingQueue.get(engine)?.length) {
        this.processPendingQueue(engine);
      }
    }
  }

  /**
   * 펜딩 큐 처리
   */
  private processPendingQueue(engine: TranslationEngine): void {
    const queue = this.pendingQueue.get(engine);
    if (!queue || queue.length === 0) return;

    const state = this.states.get(engine);
    if (!state || state.tokens < 1) return;

    while (queue.length > 0 && state.tokens >= 1) {
      const task = queue.shift();
      if (task) {
        task();
        state.tokens -= 1;
      }
    }
  }

  /**
   * 요청 전 대기
   * Rate limit 확인하고 필요시 대기
   */
  async waitForSlot(engine: TranslationEngine): Promise<void> {
    return new Promise((resolve) => {
      const state = this.states.get(engine);
      if (!state) {
        resolve();
        return;
      }

      if (state.tokens >= 1) {
        state.tokens -= 1;
        resolve();
      } else {
        // 토큰이 없으면 큐에 추가
        const queue = this.pendingQueue.get(engine);
        if (queue) {
          queue.push(() => Promise.resolve());
        }
      }
    });
  }

  /**
   * 배치 요청 전 대기
   */
  async waitForBatchSlot(engine: TranslationEngine, count: number): Promise<void> {
    const state = this.states.get(engine);
    if (!state) return;

    // 필요한 토큰만큼 대기
    for (let i = 0; i < count; i++) {
      await this.waitForSlot(engine);
    }
  }

  /**
   * Rate limit 상태 확인
   */
  isRateLimited(engine: TranslationEngine): boolean {
    const state = this.states.get(engine);
    return state?.isLimited ?? false;
  }

  /**
   * 토큰 상태 조회
   */
  getTokenCount(engine: TranslationEngine): number {
    const state = this.states.get(engine);
    return state?.tokens ?? 0;
  }

  /**
   * 배치 크기 제한 반환
   */
  getMaxBatchSize(engine: TranslationEngine): number {
    const config = this.limitConfigs.get(engine);
    return config?.batchSize ?? 25;
  }

  /**
   * 재시도 대기 시간 계산 (지수 백오프)
   */
  calculateBackoffDelay(retryCount: number, maxRetries: number = 3): number {
    if (retryCount >= maxRetries) {
      return -1; // 재시도 포기
    }

    // 1s, 2s, 4s, 8s...
    const baseDelay = 1000 * Math.pow(2, retryCount);
    // 10% ~ 20% 지터 추가
    const jitter = baseDelay * (0.1 + Math.random() * 0.1);
    return Math.floor(baseDelay + jitter);
  }

  /**
   * Rate limit 리셋 (테스트용)
   */
  resetLimiter(): void {
    const now = Date.now();
    for (const [engine, config] of this.limitConfigs) {
      const state = this.states.get(engine);
      if (state) {
        state.tokens = config.maxRequests;
        state.lastRefillTime = now;
        state.isLimited = false;
      }
    }
  }

  /**
   * 상태 로깅
   */
  logState(): void {
    for (const [engine, state] of this.states) {
      Logger.debug('RateLimiter', `${engine}: ${state.tokens.toFixed(2)} tokens, limited: ${state.isLimited}`);
    }
  }
}

export const rateLimiter = new RateLimiter();
