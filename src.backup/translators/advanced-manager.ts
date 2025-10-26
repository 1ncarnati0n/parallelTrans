/**
 * Advanced Translation Manager
 * - Batch processing
 * - Rate limiting
 * - Fallback strategy
 * - Smart caching
 */

import {
  TranslationRequest,
  TranslationResponse,
  BatchTranslationRequest,
  BatchTranslationResponse,
  TranslationEngine,
  Settings,
  TranslationResult,
} from '../types';
import { RateLimitError, APIKeyError } from '../utils/errors';
import { ITranslator } from './base';
import { DeepLTranslator } from './deepl';
import { MicrosoftTranslator } from './microsoft';
import { TranslationCache } from '../utils/cache';
import { RateLimiter } from '../utils/rate-limiter';
import { Logger } from '../utils/logger';

export class AdvancedTranslationManager {
  private translators: Map<TranslationEngine, ITranslator> = new Map();
  private cache: TranslationCache;
  private rateLimiter: RateLimiter;
  private primaryEngine: TranslationEngine = 'deepl';
  private fallbackEngine: TranslationEngine = 'microsoft';
  private settings: Partial<Settings> = {
    enableBatchTranslation: true,
    batchSize: 10,
  };

  constructor() {
    this.cache = new TranslationCache();
    this.rateLimiter = new RateLimiter();
  }

  /**
   * 설정 업데이트
   */
  updateSettings(settings: Partial<Settings>): void {
    this.settings = { ...this.settings, ...settings };

    if (settings.deeplApiKey) {
      this.setDeepLApiKey(settings.deeplApiKey, settings.deeplIsFree ?? true);
    }

    if (settings.microsoftApiKey) {
      this.setMicrosoftApiKey(settings.microsoftApiKey, settings.microsoftRegion);
    }

    if (settings.primaryEngine) {
      this.primaryEngine = settings.primaryEngine;
    }

    if (settings.fallbackEngine) {
      this.fallbackEngine = settings.fallbackEngine;
    }

    Logger.info('AdvancedManager', 'Settings updated', { settings });
  }

  /**
   * DeepL API 키 설정
   */
  setDeepLApiKey(apiKey: string, isFree: boolean = true): void {
    if (!apiKey?.trim()) {
      this.translators.delete('deepl');
      Logger.warn('AdvancedManager', 'DeepL API key removed');
      return;
    }

    const translator = new DeepLTranslator(apiKey, isFree);
    this.translators.set('deepl', translator);
    Logger.info('AdvancedManager', 'DeepL configured', { isFree });
  }

  /**
   * Microsoft API 키 설정
   */
  setMicrosoftApiKey(apiKey: string, region: string = 'global'): void {
    if (!apiKey?.trim()) {
      this.translators.delete('microsoft');
      Logger.warn('AdvancedManager', 'Microsoft API key removed');
      return;
    }

    const translator = new MicrosoftTranslator(apiKey, region);
    this.translators.set('microsoft', translator);
    Logger.info('AdvancedManager', 'Microsoft configured', { region });
  }

  /**
   * 단일 텍스트 번역
   */
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const engine = request.engine || this.primaryEngine;

    // 캐시 확인
    const cached = await this.cache.get(request.text, request.sourceLang, request.targetLang);
    if (cached) {
      Logger.debug('AdvancedManager', 'Cache hit');
      return {
        translatedText: cached.translation,
        engine: cached.engine,
        cached: true,
      };
    }

    // 레이트 제한 대기
    await this.rateLimiter.waitForSlot(engine);

    try {
      const translator = this.translators.get(engine);
      if (!translator?.isConfigured()) {
        throw new Error(`${engine} not configured`);
      }

      const result = await translator.translate(request);

      // 캐시 저장
      await this.cache.set(
        request.text,
        result.translatedText,
        request.sourceLang,
        request.targetLang,
        engine
      );

      return result;
    } catch (error) {
      // 폴백 시도
      if (engine !== this.fallbackEngine) {
        Logger.warn('AdvancedManager', `${engine} failed, trying fallback`);
        return this.translate({
          ...request,
          engine: this.fallbackEngine,
        });
      }

      throw error;
    }
  }

  /**
   * 배치 번역
   */
  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const engine = request.engine || this.primaryEngine;

    if (!request.texts?.length) {
      throw new Error('No texts to translate');
    }

    // 캐시 확인
    const cacheResults = await this.cache.getBatch(
      request.texts,
      request.sourceLang,
      request.targetLang
    );

    const uncachedTexts: string[] = [];
    const uncachedIndexes: number[] = [];

    request.texts.forEach((text, index) => {
      if (!cacheResults.get(text)) {
        uncachedTexts.push(text);
        uncachedIndexes.push(index);
      }
    });

    const translations = new Array(request.texts.length);

    // 캐시된 결과 먼저 채우기
    request.texts.forEach((text, index) => {
      const cached = cacheResults.get(text);
      if (cached) {
        translations[index] = cached.translation;
      }
    });

    // 캐시되지 않은 텍스트 번역
    if (uncachedTexts.length > 0) {
      const translator = this.translators.get(engine);
      if (!translator?.isConfigured()) {
        throw new Error(`${engine} not configured`);
      }

      try {
        // 레이트 제한 대기
        await this.rateLimiter.waitForBatchSlot(engine, uncachedTexts.length);

        // 배치 번역 지원 확인
        const maxBatchSize = translator.getMaxBatchSize?.() || 25;
        const hasBatchMethod = typeof (translator as any).translateBatch === 'function';

        if (hasBatchMethod && (translator as any).translateBatch) {

          // 배치 크기별로 나누어 번역
          const results: string[] = [];
          for (let i = 0; i < uncachedTexts.length; i += maxBatchSize) {
            const batch = uncachedTexts.slice(i, i + maxBatchSize);
            const batchResult = await (translator as any).translateBatch({
              texts: batch,
              sourceLang: request.sourceLang,
              targetLang: request.targetLang,
            });
            results.push(...batchResult.translations);
          }

          // 결과를 원래 순서대로 배치
          uncachedIndexes.forEach((originalIndex, resultIndex) => {
            translations[originalIndex] = results[resultIndex];
          });

          // 캐시 저장
          for (let i = 0; i < uncachedTexts.length; i++) {
            await this.cache.set(
              uncachedTexts[i],
              results[i],
              request.sourceLang,
              request.targetLang,
              engine
            );
          }
        } else {
          // 배치 미지원: 병렬 처리
          const batchResult = await translator.translateBatch({
            texts: uncachedTexts,
            sourceLang: request.sourceLang,
            targetLang: request.targetLang,
          });

          uncachedIndexes.forEach((originalIndex, resultIndex) => {
            translations[originalIndex] = batchResult.translations[resultIndex];
          });
        }
      } catch (error) {
        // 폴백 시도
        if (engine !== this.fallbackEngine) {
          Logger.warn('AdvancedManager', `Batch ${engine} failed, trying fallback`);
          return this.translateBatch({
            ...request,
            engine: this.fallbackEngine,
          });
        }
        throw error;
      }
    }

    return {
      translations,
      engine,
    };
  }

  /**
   * 요청 처리 (메시지 기반)
   */
  async handleTranslationRequest(
    request: TranslationRequest | BatchTranslationRequest
  ): Promise<TranslationResult> {
    const startTime = Date.now();

    try {
      if ('texts' in request) {
        // 배치 요청
        const result = await this.translateBatch(request as BatchTranslationRequest);
        const duration = Date.now() - startTime;

        return {
          success: true,
          translations: result.translations,
        };
      } else {
        // 단일 요청
        const result = await this.translate(request as TranslationRequest);
        const duration = Date.now() - startTime;

        return {
          success: true,
          translation: result.translatedText,
        };
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        return {
          success: false,
          error: error.message,
          retryAfter: error.retryAfter,
        };
      }

      if (error instanceof APIKeyError) {
        return {
          success: false,
          error: `API key not configured: ${error.engine}`,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 캐시 통계
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * 캐시 초기화
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * 레이트 제한 상태
   */
  getRateLimitStatus() {
    return {
      deepl: {
        tokens: this.rateLimiter.getTokenCount('deepl'),
        limited: this.rateLimiter.isRateLimited('deepl'),
      },
      microsoft: {
        tokens: this.rateLimiter.getTokenCount('microsoft'),
        limited: this.rateLimiter.isRateLimited('microsoft'),
      },
    };
  }

  /**
   * 구성된 엔진 확인
   */
  getConfiguredEngines(): TranslationEngine[] {
    const engines: TranslationEngine[] = [];
    for (const [engine, translator] of this.translators) {
      if (translator.isConfigured()) {
        engines.push(engine);
      }
    }
    return engines;
  }
}

export const advancedManager = new AdvancedTranslationManager();
