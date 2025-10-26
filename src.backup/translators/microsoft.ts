/**
 * Microsoft Translator API
 * Free tier with 2 million characters per month
 * - Single text translation
 * - Batch translation (multiple texts in one request)
 * - Rate limit: 200 requests/minute
 */

import { TranslationRequest, TranslationResponse, BatchTranslationRequest, BatchTranslationResponse } from '../types';
import { BaseTranslator } from './base';
import { APIKeyError, NetworkError, TranslationError, RateLimitError } from '../utils/errors';
import { Logger } from '../utils/logger';

export class MicrosoftTranslator extends BaseTranslator {
  private readonly apiUrl = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0';
  private readonly apiKey: string;
  private readonly region: string;

  constructor(apiKey: string, region: string = 'global') {
    super();
    this.apiKey = apiKey;
    this.region = region;
  }

  getEngineName() {
    return 'microsoft' as const;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * 단일 텍스트 번역
   */
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    this.validateRequest(request);

    if (!this.isConfigured()) {
      throw new APIKeyError('microsoft');
    }

    const startTime = Date.now();

    try {
      const response = await fetch(
        `${this.apiUrl}&from=${request.sourceLang}&to=${request.targetLang}`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey,
            'Ocp-Apim-Subscription-Region': this.region,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{ text: request.text }]),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new RateLimitError('microsoft', 60);
        }
        if (response.status === 403 || response.status === 401) {
          throw new APIKeyError('microsoft', 'Invalid or unauthorized API key');
        }
        throw new NetworkError(`HTTP ${response.status}`, response.status);
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0 || !data[0].translations) {
        throw new TranslationError('No translation returned', 'microsoft');
      }

      const duration = Date.now() - startTime;
      Logger.translation('Microsoft', request.text.length, duration);

      return {
        translatedText: data[0].translations[0].text,
        engine: 'microsoft',
      };
    } catch (error) {
      if (error instanceof APIKeyError || error instanceof NetworkError || error instanceof RateLimitError) {
        throw error;
      }
      Logger.error('Microsoft', 'Translation failed', error);
      throw new TranslationError('Translation failed', 'microsoft', error);
    }
  }

  /**
   * 배치 번역 (여러 텍스트)
   * Microsoft는 한 번의 요청으로 여러 텍스트를 번역할 수 있음
   */
  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    if (!request.texts || request.texts.length === 0) {
      throw new TranslationError('No texts to translate', 'microsoft');
    }

    if (!this.isConfigured()) {
      throw new APIKeyError('microsoft');
    }

    const startTime = Date.now();
    const totalChars = request.texts.reduce((sum, text) => sum + text.length, 0);

    try {
      const payload = request.texts.map((text) => ({ text }));

      const response = await fetch(
        `${this.apiUrl}&from=${request.sourceLang}&to=${request.targetLang}`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey,
            'Ocp-Apim-Subscription-Region': this.region,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new RateLimitError('microsoft', 60);
        }
        if (response.status === 403 || response.status === 401) {
          throw new APIKeyError('microsoft', 'Invalid or unauthorized API key');
        }
        throw new NetworkError(`HTTP ${response.status}`, response.status);
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new TranslationError('No translation returned', 'microsoft');
      }

      const translations = data.map((item: any) => {
        if (!item.translations || item.translations.length === 0) {
          throw new TranslationError('No translation in response', 'microsoft');
        }
        return item.translations[0].text;
      });

      const duration = Date.now() - startTime;

      Logger.translation('Microsoft (Batch)', totalChars, duration);
      Logger.debug('Microsoft', `Batch translated ${request.texts.length} texts in ${duration}ms`);

      return {
        translations,
        engine: 'microsoft',
      };
    } catch (error) {
      if (error instanceof APIKeyError || error instanceof NetworkError || error instanceof RateLimitError) {
        throw error;
      }
      Logger.error('Microsoft', 'Batch translation failed', error);
      throw new TranslationError('Batch translation failed', 'microsoft', error);
    }
  }

  /**
   * 최대 배치 크기 반환
   */
  getMaxBatchSize(): number {
    // Microsoft는 한 번에 최대 25개 텍스트 권장 (메모리 고려)
    return 25;
  }
}
