import { Settings } from '../types';

/**
 * 기본 설정값
 */
export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  engine: 'libretranslate-public',        // 기본값: 공개 서버 (Docker 불필요)
  deeplApiKey: '',
  libretranslateUrl: 'https://libretranslate.com',  // 공개 서버
  sourceLang: 'en',
  targetLang: 'ko',
  excludedSites: [],
  triggerMode: 'manual',                  // 기본값: Option+A로 번역
  displayMode: 'parallel',                // 기본값: 병행 표기
  keyboardShortcut: 'Alt+A'               // Mac: Option+A, Windows: Alt+A
};

/**
 * Chrome Storage API 래퍼
 */
export class StorageManager {
  /**
   * 설정 가져오기
   */
  async getSettings(): Promise<Settings> {
    try {
      const result = await chrome.storage.sync.get('settings');
      return {
        ...DEFAULT_SETTINGS,
        ...result.settings
      };
    } catch (error) {
      console.error('Failed to get settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * 설정 저장
   */
  async saveSettings(settings: Partial<Settings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const newSettings = {
        ...currentSettings,
        ...settings
      };
      await chrome.storage.sync.set({ settings: newSettings });
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * 특정 사이트 제외 여부 확인
   */
  async isExcludedSite(url: string): Promise<boolean> {
    const settings = await this.getSettings();
    const hostname = new URL(url).hostname;
    return settings.excludedSites.some(site => hostname.includes(site));
  }

  /**
   * 사이트 제외 목록에 추가
   */
  async addExcludedSite(site: string): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.excludedSites.includes(site)) {
      settings.excludedSites.push(site);
      await this.saveSettings({ excludedSites: settings.excludedSites });
    }
  }

  /**
   * 사이트 제외 목록에서 제거
   */
  async removeExcludedSite(site: string): Promise<void> {
    const settings = await this.getSettings();
    settings.excludedSites = settings.excludedSites.filter(s => s !== site);
    await this.saveSettings({ excludedSites: settings.excludedSites });
  }
}
