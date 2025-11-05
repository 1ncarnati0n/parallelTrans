/**
 * Translation Engines
 */

import { TranslationRequest, BatchTranslationRequest, TranslationResponse, BatchTranslationResponse, ApiError, TranslationEngine } from './types';
import { Logger } from './utils';

// ============== DeepL ==============
export class DeepL {
  private apiUrl = 'https://api-free.deepl.com/v2/translate';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
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
        // JSON 파싱 실패 시 텍스트로 시도
        try {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        } catch {
          // 무시
        }
      }
      
      const apiError: ApiError = {
        status: response.status,
        message: errorMessage,
        engine: 'deepl',
        details: errorDetails,
      };
      
      Logger.error('DeepL', `Translation failed: ${errorMessage}`, apiError);
      throw apiError;
    }

    const data = await response.json();
    
    if (!data.translations || !data.translations[0] || !data.translations[0].text) {
      const error: ApiError = {
        status: response.status,
        message: 'Invalid response format from DeepL',
        engine: 'deepl',
        details: data,
      };
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
      
      const apiError: ApiError = {
        status: response.status,
        message: errorMessage,
        engine: 'deepl',
        details: errorDetails,
      };
      
      Logger.error('DeepL', `Batch translation failed: ${errorMessage}`, apiError);
      throw apiError;
    }

    const data = await response.json();
    
    if (!data.translations || !Array.isArray(data.translations)) {
      const error: ApiError = {
        status: response.status,
        message: 'Invalid batch response format from DeepL',
        engine: 'deepl',
        details: data,
      };
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
export class Microsoft {
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
      
      const apiError: ApiError = {
        status: response.status,
        message: errorMessage,
        engine: 'microsoft',
        details: errorDetails,
      };
      
      Logger.error('Microsoft', `Translation failed: ${errorMessage}`, apiError);
      throw apiError;
    }

    const data = await response.json();
    
    if (!Array.isArray(data) || !data[0] || !data[0].translations || !data[0].translations[0] || !data[0].translations[0].text) {
      const error: ApiError = {
        status: response.status,
        message: 'Invalid response format from Microsoft',
        engine: 'microsoft',
        details: data,
      };
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
      
      const apiError: ApiError = {
        status: response.status,
        message: errorMessage,
        engine: 'microsoft',
        details: errorDetails,
      };
      
      Logger.error('Microsoft', `Batch translation failed: ${errorMessage}`, apiError);
      throw apiError;
    }

    const data = await response.json();
    
    if (!Array.isArray(data) || data.length !== request.texts.length) {
      const error: ApiError = {
        status: response.status,
        message: 'Invalid batch response format from Microsoft',
        engine: 'microsoft',
        details: data,
      };
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
  private deepl: DeepL | null = null;
  private microsoft: Microsoft | null = null;

  configure(settings: any) {
    if (settings.deeplApiKey) {
      this.deepl = new DeepL(settings.deeplApiKey);
    }
    if (settings.microsoftApiKey) {
      this.microsoft = new Microsoft(settings.microsoftApiKey, settings.microsoftRegion);
    }
  }

  async translate(engine: 'deepl' | 'microsoft', request: TranslationRequest): Promise<TranslationResponse> {
    const translator = engine === 'deepl' ? this.deepl : this.microsoft;
    if (!translator || !translator.isConfigured()) {
      throw new Error(`${engine} not configured`);
    }
    return translator.translate(request);
  }

  async translateBatch(engine: 'deepl' | 'microsoft', request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const translator = engine === 'deepl' ? this.deepl : this.microsoft;
    if (!translator || !translator.isConfigured()) {
      throw new Error(`${engine} not configured`);
    }
    return translator.translateBatch(request);
  }

  isConfigured(engine: 'deepl' | 'microsoft'): boolean {
    const translator = engine === 'deepl' ? this.deepl : this.microsoft;
    return translator?.isConfigured() ?? false;
  }
}
