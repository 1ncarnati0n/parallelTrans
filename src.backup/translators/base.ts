/**
 * Base translator interface
 * All translation engines must implement this interface
 */

import { TranslationRequest, TranslationResponse, TranslationEngine, BatchTranslationRequest, BatchTranslationResponse } from '../types';

export interface ITranslator {
  /**
   * Translate single text from source language to target language
   */
  translate(request: TranslationRequest): Promise<TranslationResponse>;

  /**
   * Translate multiple texts in batch (optional)
   */
  translateBatch?(request: BatchTranslationRequest): Promise<BatchTranslationResponse>;

  /**
   * Get the engine name
   */
  getEngineName(): TranslationEngine;

  /**
   * Check if the translator is properly configured
   */
  isConfigured(): boolean;

  /**
   * Get maximum batch size for this engine
   */
  getMaxBatchSize?(): number;
}

/**
 * Abstract base class for translators
 */
export abstract class BaseTranslator implements ITranslator {
  abstract translate(request: TranslationRequest): Promise<TranslationResponse>;
  abstract getEngineName(): TranslationEngine;
  abstract isConfigured(): boolean;

  /**
   * Default batch translation implementation (can be overridden)
   */
  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    // 기본 구현: 개별 번역 병렬 처리
    const promises = request.texts.map((text) =>
      this.translate({
        text,
        sourceLang: request.sourceLang,
        targetLang: request.targetLang,
      })
    );

    const results = await Promise.all(promises);
    return {
      translations: results.map((r) => r.translatedText),
      engine: this.getEngineName(),
    };
  }

  /**
   * 기본 배치 크기 (엔진별 오버라이드 가능)
   */
  getMaxBatchSize(): number {
    return 25;
  }

  /**
   * Validate translation request
   */
  protected validateRequest(request: TranslationRequest): void {
    if (!request.text || request.text.trim().length === 0) {
      throw new Error('Translation text cannot be empty');
    }

    if (!request.sourceLang || !request.targetLang) {
      throw new Error('Source and target languages must be specified');
    }

    if (request.sourceLang === request.targetLang) {
      throw new Error('Source and target languages cannot be the same');
    }
  }

  /**
   * Handle API errors with detailed messages
   */
  protected handleAPIError(error: unknown, engine: string): never {
    if (error instanceof Error) {
      throw new Error(`${engine} API error: ${error.message}`);
    }
    throw new Error(`${engine} API error: Unknown error occurred`);
  }
}
