/**
 * Translation Engines
 * - DeepL: NMT (Neural Machine Translation)
 * - Google NMT: Google Cloud Translation API v2
 * - Gemini LLM: Google Gemini API for context-aware translation
 */

import { TranslationRequest, BatchTranslationRequest, TranslationResponse, BatchTranslationResponse, TranslationEngine, Settings } from './types';
import { Logger, createApiError, diagnoseApiError } from './utils';

// ============== 번역 엔진 인터페이스 ==============
export interface ITranslationEngine {
  isConfigured(): boolean;
  translate(request: TranslationRequest): Promise<TranslationResponse>;
  translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse>;
}

// ============== DeepL API ==============
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
      const errorMessage = await this.extractErrorMessage(response, 'DeepL error');
      const apiError = createApiError(response.status, errorMessage, 'deepl');
      Logger.error('DeepL', `Translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();

    if (!data.translations?.[0]?.text) {
      throw createApiError(response.status, 'Invalid response format from DeepL', 'deepl', data);
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

    // DeepL은 여러 텍스트를 'text' 파라미터로 반복 추가
    request.texts.forEach(text => params.append('text', text));

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response, 'DeepL batch error');
      const apiError = createApiError(response.status, errorMessage, 'deepl');
      Logger.error('DeepL', `Batch translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();

    if (!data.translations || !Array.isArray(data.translations)) {
      throw createApiError(response.status, 'Invalid batch response format from DeepL', 'deepl', data);
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

  private async extractErrorMessage(response: Response, defaultMsg: string): Promise<string> {
    try {
      const errorData = await response.json();
      return errorData.message || errorData.error?.message || `${defaultMsg}: ${response.status}`;
    } catch {
      try {
        return await response.text() || `${defaultMsg}: ${response.status}`;
      } catch {
        return `${defaultMsg}: ${response.status}`;
      }
    }
  }
}

// ============== Google Cloud Translation API v2 (NMT) ==============
export class GoogleNMT implements ITranslationEngine {
  private apiUrl = 'https://translation.googleapis.com/language/translate/v2';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim());
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const url = `${this.apiUrl}?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: request.text,
        source: this.mapLang(request.sourceLang),
        target: this.mapLang(request.targetLang),
        format: 'text',
      }),
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response, 'Google NMT error');
      const apiError = createApiError(response.status, errorMessage, 'google-nmt');
      Logger.error('GoogleNMT', `Translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();

    if (!data.data?.translations?.[0]?.translatedText) {
      throw createApiError(response.status, 'Invalid response format from Google NMT', 'google-nmt', data);
    }

    return {
      translatedText: data.data.translations[0].translatedText,
      engine: 'google-nmt',
    };
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const url = `${this.apiUrl}?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: request.texts,
        source: this.mapLang(request.sourceLang),
        target: this.mapLang(request.targetLang),
        format: 'text',
      }),
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response, 'Google NMT batch error');
      const apiError = createApiError(response.status, errorMessage, 'google-nmt');
      Logger.error('GoogleNMT', `Batch translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();

    if (!data.data?.translations || !Array.isArray(data.data.translations)) {
      throw createApiError(response.status, 'Invalid batch response format from Google NMT', 'google-nmt', data);
    }

    return {
      translations: data.data.translations.map((t: { translatedText: string }) => t.translatedText),
      engine: 'google-nmt',
    };
  }

  private mapLang(lang: string): string {
    const map: Record<string, string> = {
      'zh': 'zh-CN',
      'zh-tw': 'zh-TW',
    };
    return map[lang.toLowerCase()] || lang.toLowerCase();
  }

  private async extractErrorMessage(response: Response, defaultMsg: string): Promise<string> {
    try {
      const errorData = await response.json();
      return errorData.error?.message || `${defaultMsg}: ${response.status}`;
    } catch {
      return `${defaultMsg}: ${response.status}`;
    }
  }
}

// ============== Google Gemini API (LLM-based Translation) ==============
export class GeminiLLM implements ITranslationEngine {
  private apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim());
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const prompt = this.buildTranslationPrompt(request.text, request.sourceLang, request.targetLang);
    const url = `${this.apiUrl}?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1, // 번역은 창의성보다 정확성 중시
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response, 'Gemini error');
      const apiError = createApiError(response.status, errorMessage, 'gemini-llm');
      Logger.error('GeminiLLM', `Translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();
    const translatedText = this.extractTranslation(data);

    if (!translatedText) {
      throw createApiError(response.status, 'Invalid response format from Gemini', 'gemini-llm', data);
    }

    return {
      translatedText,
      engine: 'gemini-llm',
    };
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    // Gemini는 배치 API가 없으므로 순차 처리
    // 성능 최적화를 위해 여러 텍스트를 하나의 프롬프트로 묶음
    const batchPrompt = this.buildBatchTranslationPrompt(
      request.texts,
      request.sourceLang,
      request.targetLang
    );

    const url = `${this.apiUrl}?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: batchPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response, 'Gemini batch error');
      const apiError = createApiError(response.status, errorMessage, 'gemini-llm');
      Logger.error('GeminiLLM', `Batch translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();
    const translations = this.extractBatchTranslations(data, request.texts.length);

    return {
      translations,
      engine: 'gemini-llm',
    };
  }

  private buildTranslationPrompt(text: string, sourceLang: string, targetLang: string): string {
    const sourceName = this.getLangName(sourceLang);
    const targetName = this.getLangName(targetLang);

    return `Translate the following ${sourceName} text to ${targetName}.
Rules:
- Translate naturally, preserving the original tone and nuance
- Do NOT add any explanations, notes, or alternatives
- Do NOT include the original text in your response
- Output ONLY the translated text, nothing else

Text to translate:
${text}`;
  }

  private buildBatchTranslationPrompt(texts: string[], sourceLang: string, targetLang: string): string {
    const sourceName = this.getLangName(sourceLang);
    const targetName = this.getLangName(targetLang);

    const numberedTexts = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n');

    return `Translate each numbered ${sourceName} text below to ${targetName}.
Rules:
- Translate naturally, preserving the original tone and nuance
- Output ONLY the translations in the same numbered format
- Do NOT add explanations or include original text
- Keep the exact same numbering format: [1], [2], etc.

Texts to translate:
${numberedTexts}`;
  }

  private extractTranslation(data: unknown): string | null {
    try {
      const response = data as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };
      return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch {
      return null;
    }
  }

  private extractBatchTranslations(data: unknown, expectedCount: number): string[] {
    const rawText = this.extractTranslation(data);
    if (!rawText) {
      return new Array(expectedCount).fill('');
    }

    // [1], [2] 형식으로 파싱
    const translations: string[] = [];
    const lines = rawText.split('\n');

    for (let i = 1; i <= expectedCount; i++) {
      const pattern = new RegExp(`^\\[${i}\\]\\s*(.*)$`);
      let found = false;

      for (const line of lines) {
        const match = line.match(pattern);
        if (match) {
          translations.push(match[1].trim());
          found = true;
          break;
        }
      }

      if (!found) {
        // 번호를 찾지 못하면 순서대로 매핑 시도
        const cleanLine = lines[i - 1]?.replace(/^\[\d+\]\s*/, '').trim();
        translations.push(cleanLine || '');
      }
    }

    return translations;
  }

  private getLangName(code: string): string {
    const names: Record<string, string> = {
      en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese',
      es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
      pt: 'Portuguese', ru: 'Russian', pl: 'Polish', nl: 'Dutch',
    };
    return names[code.toLowerCase()] || code;
  }

  private async extractErrorMessage(response: Response, defaultMsg: string): Promise<string> {
    try {
      const errorData = await response.json();
      return errorData.error?.message || `${defaultMsg}: ${response.status}`;
    } catch {
      return `${defaultMsg}: ${response.status}`;
    }
  }
}

// ============== 엔진 매니저 ==============
export class TranslationManager {
  private engines: Map<TranslationEngine, ITranslationEngine> = new Map();

  configure(settings: Settings): void {
    this.engines.clear();

    // DeepL
    if (settings.deeplApiKey) {
      this.engines.set('deepl', new DeepL(settings.deeplApiKey, settings.deeplIsFree));
    }

    // Google NMT
    if (settings.googleApiKey) {
      this.engines.set('google-nmt', new GoogleNMT(settings.googleApiKey));
    }

    // Gemini LLM (geminiApiKey 우선, 없으면 googleApiKey 사용)
    const geminiKey = settings.geminiApiKey || settings.googleApiKey;
    if (geminiKey) {
      this.engines.set('gemini-llm', new GeminiLLM(geminiKey));
    }

    Logger.info('TranslationManager', `Configured engines: ${Array.from(this.engines.keys()).join(', ')}`);
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

  getConfiguredEngines(): TranslationEngine[] {
    return Array.from(this.engines.keys()).filter(e => this.isConfigured(e));
  }
}
