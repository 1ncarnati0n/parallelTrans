/**
 * Translation Engines
 * - DeepL: NMT (Neural Machine Translation)
 * - Groq LLM: Groq API (LPU-based ultra-fast LLM translation)
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
      text: request.text,
      source_lang: this.mapLang(request.sourceLang),
      target_lang: this.mapLang(request.targetLang),
    });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
      },
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
      source_lang: this.mapLang(request.sourceLang),
      target_lang: this.mapLang(request.targetLang),
    });

    // DeepL은 여러 텍스트를 'text' 파라미터로 반복 추가
    request.texts.forEach(text => params.append('text', text));

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
      },
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

// ============== Groq API (OpenAI-compatible LLM Translation) ==============
export class GroqLLM implements ITranslationEngine {
  private apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
  private apiKey: string;
  private model = 'llama-3.3-70b-versatile';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim());
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const prompt = this.buildTranslationPrompt(request.text, request.sourceLang, request.targetLang);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Follow the user\'s translation instructions exactly.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response, 'Groq error');
      const apiError = createApiError(response.status, errorMessage, 'groq-llm');
      Logger.error('GroqLLM', `Translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim() || null;

    if (!translatedText) {
      throw createApiError(response.status, 'Invalid response format from Groq', 'groq-llm', data);
    }

    return {
      translatedText,
      engine: 'groq-llm',
    };
  }

  async translateBatch(request: BatchTranslationRequest): Promise<BatchTranslationResponse> {
    const batchPrompt = this.buildBatchTranslationPrompt(
      request.texts,
      request.sourceLang,
      request.targetLang
    );

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Follow the user\'s translation instructions exactly.',
          },
          {
            role: 'user',
            content: batchPrompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const errorMessage = await this.extractErrorMessage(response, 'Groq batch error');
      const apiError = createApiError(response.status, errorMessage, 'groq-llm');
      Logger.error('GroqLLM', `Batch translation failed - ${diagnoseApiError(apiError)}`);
      throw apiError;
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content?.trim() || null;
    const translations = this.extractBatchTranslations(rawText, request.texts.length);

    return {
      translations,
      engine: 'groq-llm',
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

  private extractBatchTranslations(rawText: string | null, expectedCount: number): string[] {
    if (!rawText) {
      return new Array(expectedCount).fill('');
    }

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

    // Groq LLM
    if (settings.groqApiKey) {
      this.engines.set('groq-llm', new GroqLLM(settings.groqApiKey));
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
