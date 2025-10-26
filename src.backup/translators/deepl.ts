/**
 * DeepL Translation Engine
 * High-quality translation with free tier (500k chars/month)
 * - Single text translation
 * - Batch translation (multiple texts in one request)
 * - Free tier: 5 requests/sec
 */

import { TranslationRequest, TranslationResponse, BatchTranslationRequest, BatchTranslationResponse } from '../types';
import { BaseTranslator } from './base';
import { APIKeyError, NetworkError, TranslationError, RateLimitError } from '../utils/errors';
import { Logger } from '../utils/logger';

export class DeepLTranslator extends BaseTranslator {
  private readonly apiUrl = 'https://api-free.deepl.com/v2/translate';
  private readonly apiKey: string;
  private readonly isFree: boolean;

  constructor(apiKey: string, isFree: boolean = true) {
    super();
    this.apiKey = apiKey;
    this.isFree = isFree;
  }

  getEngineName() {
    return 'deepl' as const;
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
      throw new APIKeyError('deepl');
    }

    const startTime = Date.now();

    const params = new URLSearchParams({
      auth_key: this.apiKey,
      text: request.text,
      source_lang: this.mapLanguageCode(request.sourceLang),
      target_lang: this.mapLanguageCode(request.targetLang),
    });

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new RateLimitError('deepl', 60);
        }
        if (response.status === 403) {
          throw new APIKeyError('deepl', 'Invalid API key');
        }
        throw new NetworkError(`HTTP ${response.status}`, response.status);
      }

      const data = await response.json();

      if (!data.translations || data.translations.length === 0) {
        throw new TranslationError('No translation returned', 'deepl');
      }

      const duration = Date.now() - startTime;
      Logger.translation('DeepL', request.text.length, duration);

      return {
        translatedText: data.translations[0].text,
        engine: 'deepl',
      };
    } catch (error) {
      if (error instanceof APIKeyError || error instanceof NetworkError || error instanceof RateLimitError) {
        throw error;
      }
      Logger.error('DeepL', 'Translation failed', error);
      throw new TranslationError('Translation failed', 'deepl', error);
    }
  }

  /**
   * 배치 번역 (여러 텍스트)
   * DeepL은 한 번의 요청으로 여러 텍스트를 번역할 수 있음
   */
  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    if (!request.texts || request.texts.length === 0) {
      throw new TranslationError('No texts to translate', 'deepl');
    }

    if (!this.isConfigured()) {
      throw new APIKeyError('deepl');
    }

    const startTime = Date.now();
    const totalChars = request.texts.reduce((sum, text) => sum + text.length, 0);

    try {
      const params = new URLSearchParams({
        auth_key: this.apiKey,
        source_lang: this.mapLanguageCode(request.sourceLang),
        target_lang: this.mapLanguageCode(request.targetLang),
      });

      // 여러 텍스트 추가
      for (const text of request.texts) {
        params.append('text', text);
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new RateLimitError('deepl', 60);
        }
        if (response.status === 403) {
          throw new APIKeyError('deepl', 'Invalid API key');
        }
        throw new NetworkError(`HTTP ${response.status}`, response.status);
      }

      const data = await response.json();

      if (!data.translations || data.translations.length === 0) {
        throw new TranslationError('No translation returned', 'deepl');
      }

      const translations = data.translations.map((t: any) => t.text);
      const duration = Date.now() - startTime;

      Logger.translation('DeepL (Batch)', totalChars, duration);
      Logger.debug('DeepL', `Batch translated ${request.texts.length} texts in ${duration}ms`);

      return {
        translations,
        engine: 'deepl',
      };
    } catch (error) {
      if (error instanceof APIKeyError || error instanceof NetworkError || error instanceof RateLimitError) {
        throw error;
      }
      Logger.error('DeepL', 'Batch translation failed', error);
      throw new TranslationError('Batch translation failed', 'deepl', error);
    }
  }

  /**
   * 언어 코드 매핑
   */
  private mapLanguageCode(lang: string): string {
    const langMap: Record<string, string> = {
      en: 'EN',
      ko: 'KO',
      ja: 'JA',
      zh: 'ZH',
      es: 'ES',
      fr: 'FR',
      de: 'DE',
      it: 'IT',
      pt: 'PT',
      ru: 'RU',
      pl: 'PL',
      nl: 'NL',
      sv: 'SV',
      no: 'NO',
    };
    return langMap[lang.toLowerCase()] || lang.toUpperCase();
  }

  /**
   * 지원하는 언어 조회
   */
  getMaxBatchSize(): number {
    // DeepL은 한 번에 최대 50개 텍스트 번역 가능
    return 50;
  }
}
