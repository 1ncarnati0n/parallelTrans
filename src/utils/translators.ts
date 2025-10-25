import { TranslationRequest, TranslationResponse } from '../types';

/**
 * DeepL 번역 엔진
 */
export class DeepLTranslator {
  private apiKey: string;
  private apiUrl = 'https://api-free.deepl.com/v2/translate';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    if (!this.apiKey) {
      throw new Error('DeepL API key is not set');
    }

    const params = new URLSearchParams({
      auth_key: this.apiKey,
      text: request.text,
      source_lang: this.mapLanguageCode(request.sourceLang),
      target_lang: this.mapLanguageCode(request.targetLang)
    });

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params
      });

      if (!response.ok) {
        throw new Error(`DeepL API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        translatedText: data.translations[0].text,
        engine: 'deepl'
      };
    } catch (error) {
      throw new Error(`DeepL translation failed: ${error}`);
    }
  }

  private mapLanguageCode(lang: string): string {
    const langMap: { [key: string]: string } = {
      'en': 'EN',
      'ko': 'KO',
      'ja': 'JA',
      'zh': 'ZH',
      'es': 'ES',
      'fr': 'FR',
      'de': 'DE'
    };
    return langMap[lang.toLowerCase()] || lang.toUpperCase();
  }
}

/**
 * LibreTranslate 번역 엔진
 */
export class LibreTranslator {
  private apiUrl: string;

  constructor(apiUrl: string = 'http://localhost:5000') {
    this.apiUrl = apiUrl;
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: request.text,
          source: request.sourceLang,
          target: request.targetLang,
          format: 'text'
        })
      });

      if (!response.ok) {
        throw new Error(`LibreTranslate API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        translatedText: data.translatedText,
        engine: request.engine || 'libretranslate-public'
      };
    } catch (error) {
      throw new Error(`LibreTranslate translation failed: ${error}`);
    }
  }
}

/**
 * 번역 매니저 - DeepL과 LibreTranslate를 관리
 */
export class TranslationManager {
  private deeplTranslator: DeepLTranslator | null = null;
  private librePublicTranslator: LibreTranslator | null = null;
  private libreLocalTranslator: LibreTranslator | null = null;
  private currentEngine: 'deepl' | 'libretranslate-public' | 'libretranslate-local' = 'libretranslate-public';

  setDeepLApiKey(apiKey: string) {
    this.deeplTranslator = new DeepLTranslator(apiKey);
  }

  setLibreTranslateUrl(url: string) {
    // URL에 따라 공개/로컬 서버 구분
    if (url.includes('libretranslate.com')) {
      this.librePublicTranslator = new LibreTranslator(url);
    } else {
      this.libreLocalTranslator = new LibreTranslator(url);
    }
  }

  setEngine(engine: 'deepl' | 'libretranslate-public' | 'libretranslate-local') {
    this.currentEngine = engine;
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const engine = request.engine || this.currentEngine;

    try {
      if (engine === 'deepl') {
        if (!this.deeplTranslator) {
          throw new Error('DeepL translator not initialized');
        }
        return await this.deeplTranslator.translate(request);
      } else if (engine === 'libretranslate-public') {
        if (!this.librePublicTranslator) {
          // 기본 공개 서버로 초기화
          this.librePublicTranslator = new LibreTranslator('https://libretranslate.com');
        }
        return await this.librePublicTranslator.translate({...request, engine: 'libretranslate-public'});
      } else { // libretranslate-local
        if (!this.libreLocalTranslator) {
          // 기본 로컬 서버로 초기화
          this.libreLocalTranslator = new LibreTranslator('http://localhost:5001');
        }
        return await this.libreLocalTranslator.translate({...request, engine: 'libretranslate-local'});
      }
    } catch (error) {
      console.error(`Translation with ${engine} failed:`, error);
      throw error;
    }
  }
}
