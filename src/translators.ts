/**
 * Translation Engines
 */

import { TranslationRequest, BatchTranslationRequest, TranslationResponse, BatchTranslationResponse, ApiError, TranslationEngine, Settings } from './types';
import { Logger, createApiError, diagnoseApiError } from './utils';

// ============== 번역 엔진 인터페이스 ==============
export interface ITranslationEngine {
  isConfigured(): boolean;
  translate(request: TranslationRequest): Promise<TranslationResponse>;
  translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse>;
}

// ============== DeepL ==============
export class DeepL implements ITranslationEngine {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiKey: string, isFree: boolean = true) {
    this.apiKey = apiKey;
    this.apiUrl = isFree
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim());
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const params = new URLSearchParams({
      auth_key: this.apiKey,
      text: request.text,
      source_lang: this.mapLang(request.sourceLang),
      target_lang: this.mapLang(request.targetLang),
    });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      let errorMessage = `DeepL error: ${response.status}`;
      let errorDetails: unknown;

      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error?.message || errorMessage;
        errorDetails = errorData;
      } catch {
        try {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        } catch {
          // 무시
        }
      }

      const apiError = createApiError(response.status, errorMessage, 'deepl', errorDetails);
      Logger.error('DeepL', `Translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();

    if (!data.translations || !data.translations[0] || !data.translations[0].text) {
      const error = createApiError(response.status, 'Invalid response format from DeepL', 'deepl', data);
      throw error;
    }

    return {
      translatedText: data.translations[0].text,
      engine: 'deepl',
    };
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const params = new URLSearchParams({
      auth_key: this.apiKey,
      source_lang: this.mapLang(request.sourceLang),
      target_lang: this.mapLang(request.targetLang),
    });

    request.texts.forEach(text => params.append('text', text));

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      let errorMessage = `DeepL batch error: ${response.status}`;
      let errorDetails: unknown;

      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error?.message || errorMessage;
        errorDetails = errorData;
      } catch {
        try {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        } catch {
          // 무시
        }
      }

      const apiError = createApiError(response.status, errorMessage, 'deepl', errorDetails);
      Logger.error('DeepL', `Batch translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();

    if (!data.translations || !Array.isArray(data.translations)) {
      const error = createApiError(response.status, 'Invalid batch response format from DeepL', 'deepl', data);
      throw error;
    }

    return {
      translations: data.translations.map((t: { text: string }) => t.text),
      engine: 'deepl',
    };
  }

  private mapLang(lang: string): string {
    const map: Record<string, string> = {
      en: 'EN', ko: 'KO', ja: 'JA', zh: 'ZH', es: 'ES', fr: 'FR',
      de: 'DE', it: 'IT', pt: 'PT', ru: 'RU', pl: 'PL', nl: 'NL',
    };
    return map[lang.toLowerCase()] || lang.toUpperCase();
  }
}

// ============== Microsoft ==============
export class Microsoft implements ITranslationEngine {
  private apiUrl = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0';
  private apiKey: string;
  private region: string;

  constructor(apiKey: string, region: string = 'global') {
    this.apiKey = apiKey;
    this.region = region;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim());
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const url = `${this.apiUrl}&from=${request.sourceLang}&to=${request.targetLang}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
        'Ocp-Apim-Subscription-Region': this.region,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ text: request.text }]),
    });

    if (!response.ok) {
      let errorMessage = `Microsoft error: ${response.status}`;
      let errorDetails: unknown;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
        errorDetails = errorData;
      } catch {
        try {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        } catch {
          // 무시
        }
      }

      const apiError = createApiError(response.status, errorMessage, 'microsoft', errorDetails);
      Logger.error('Microsoft', `Translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();

    if (!Array.isArray(data) || !data[0] || !data[0].translations || !data[0].translations[0] || !data[0].translations[0].text) {
      const error = createApiError(response.status, 'Invalid response format from Microsoft', 'microsoft', data);
      throw error;
    }

    return {
      translatedText: data[0].translations[0].text,
      engine: 'microsoft',
    };
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const url = `${this.apiUrl}&from=${request.sourceLang}&to=${request.targetLang}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
        'Ocp-Apim-Subscription-Region': this.region,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.texts.map(text => ({ text }))),
    });

    if (!response.ok) {
      let errorMessage = `Microsoft batch error: ${response.status}`;
      let errorDetails: unknown;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
        errorDetails = errorData;
      } catch {
        try {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        } catch {
          // 무시
        }
      }

      const apiError = createApiError(response.status, errorMessage, 'microsoft', errorDetails);
      Logger.error('Microsoft', `Batch translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length !== request.texts.length) {
      const error = createApiError(response.status, 'Invalid batch response format from Microsoft', 'microsoft', data);
      throw error;
    }

    return {
      translations: data.map((item: { translations: Array<{ text: string }> }) => item.translations[0].text),
      engine: 'microsoft',
    };
  }
}

// ============== 엔진 매니저 ==============
export class TranslationManager {
  private engines: Map<TranslationEngine, ITranslationEngine> = new Map();

  configure(settings: Settings): void {
    this.engines.clear();

    if (settings.deeplApiKey) {
      this.engines.set('deepl', new DeepL(settings.deeplApiKey, settings.deeplIsFree));
    }
    if (settings.microsoftApiKey) {
      this.engines.set('microsoft', new Microsoft(settings.microsoftApiKey, settings.microsoftRegion));
    }
  }

  private getEngine(engine: TranslationEngine): ITranslationEngine {
    const translator = this.engines.get(engine);
    if (!translator || !translator.isConfigured()) {
      throw new Error(`${engine} not configured`);
    }
    return translator;
  }

  async translate(engine: TranslationEngine, request: TranslationRequest): Promise<TranslationResponse> {
    return this.getEngine(engine).translate(request);
  }

  async translateBatch(engine: TranslationEngine, request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    return this.getEngine(engine).translateBatch(request);
  }

  isConfigured(engine: TranslationEngine): boolean {
    const translator = this.engines.get(engine);
    return translator?.isConfigured() ?? false;
  }
}
