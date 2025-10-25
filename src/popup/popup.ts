import { Settings } from '../types';

// DOM 요소
const enableToggle = document.getElementById('enableToggle') as HTMLInputElement;
const engineSelect = document.getElementById('engineSelect') as HTMLSelectElement;
const deeplApiKey = document.getElementById('deeplApiKey') as HTMLInputElement;
const libreUrl = document.getElementById('libreUrl') as HTMLInputElement;
const sourceLang = document.getElementById('sourceLang') as HTMLSelectElement;
const targetLang = document.getElementById('targetLang') as HTMLSelectElement;
const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const deeplSection = document.getElementById('deeplSection') as HTMLDivElement;
const libreLocalSection = document.getElementById('libreLocalSection') as HTMLDivElement;
const engineInfo = document.getElementById('engineInfo') as HTMLElement;
const displayExample = document.getElementById('displayExample') as HTMLElement;

// 라디오 버튼
const triggerModeRadios = document.getElementsByName('triggerMode') as NodeListOf<HTMLInputElement>;
const displayModeRadios = document.getElementsByName('displayMode') as NodeListOf<HTMLInputElement>;

/**
 * 초기화
 */
async function init() {
  // 설정 로드
  const settings = await loadSettings();
  updateUI(settings);

  // 이벤트 리스너
  engineSelect.addEventListener('change', handleEngineChange);
  saveButton.addEventListener('click', handleSave);
  enableToggle.addEventListener('change', handleToggleChange);
  
  // 표시 모드 변경시 예시 업데이트
  displayModeRadios.forEach(radio => {
    radio.addEventListener('change', updateDisplayExample);
  });
  
  // 초기 엔진 정보 표시
  updateEngineInfo();
}

/**
 * 설정 로드
 */
async function loadSettings(): Promise<Settings> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getSettings' });
    return response;
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('설정을 불러오는데 실패했습니다', 'error');
    throw error;
  }
}

/**
 * UI 업데이트
 */
function updateUI(settings: Settings) {
  enableToggle.checked = settings.enabled;
  engineSelect.value = settings.engine;
  deeplApiKey.value = settings.deeplApiKey;
  libreUrl.value = settings.libretranslateUrl;
  sourceLang.value = settings.sourceLang;
  targetLang.value = settings.targetLang;
  
  // 트리거 모드 라디오 버튼
  triggerModeRadios.forEach(radio => {
    if (radio.value === settings.triggerMode) {
      radio.checked = true;
    }
  });
  
  // 표시 모드 라디오 버튼
  displayModeRadios.forEach(radio => {
    if (radio.value === settings.displayMode) {
      radio.checked = true;
    }
  });

  // 엔진에 따라 섹션 표시/숨김
  updateEngineSections(settings.engine);
  updateDisplayExample();
}

/**
 * 엔진 섹션 표시/숨김
 */
function updateEngineSections(engine: string) {
  if (engine === 'deepl') {
    deeplSection.style.display = 'block';
    libreLocalSection.style.display = 'none';
  } else if (engine === 'libretranslate-local') {
    deeplSection.style.display = 'none';
    libreLocalSection.style.display = 'block';
  } else { // libretranslate-public
    deeplSection.style.display = 'none';
    libreLocalSection.style.display = 'none';
  }
}

/**
 * 엔진 정보 업데이트
 */
function updateEngineInfo() {
  const engine = engineSelect.value;
  let info = '';
  
  if (engine === 'libretranslate-public') {
    info = '✓ 공개 서버 사용 - Docker 설치 불필요, 바로 사용 가능';
  } else if (engine === 'libretranslate-local') {
    info = '⚠️ 로컬 서버 - Docker를 실행해야 합니다';
  } else if (engine === 'deepl') {
    info = '⭐ 최고 품질 - API 키 필요 (무료 50만자/월)';
  }
  
  engineInfo.textContent = info;
}

/**
 * 표시 예시 업데이트
 */
function updateDisplayExample() {
  const displayMode = (document.querySelector('input[name="displayMode"]:checked') as HTMLInputElement)?.value;
  
  if (displayMode === 'parallel') {
    displayExample.innerHTML = '병행 표기 예시: Hello World <span style="color: #2563eb;">[안녕하세요 세계]</span>';
  } else {
    displayExample.innerHTML = '번역문만 예시: <span style="color: #2563eb;">안녕하세요 세계</span> (원문 숨김)';
  }
}

/**
 * 엔진 변경 핸들러
 */
function handleEngineChange() {
  const engine = engineSelect.value;
  updateEngineSections(engine);
  updateEngineInfo();
}

/**
 * 토글 변경 핸들러
 */
async function handleToggleChange() {
  try {
    await chrome.runtime.sendMessage({
      type: 'toggleTranslation'
    });
  } catch (error) {
    console.error('Toggle failed:', error);
  }
}

/**
 * 저장 핸들러
 */
async function handleSave() {
  try {
    // 트리거 모드 가져오기
    const triggerMode = (document.querySelector('input[name="triggerMode"]:checked') as HTMLInputElement)?.value || 'manual';
    
    // 표시 모드 가져오기
    const displayMode = (document.querySelector('input[name="displayMode"]:checked') as HTMLInputElement)?.value || 'parallel';
    
    const settings: Partial<Settings> = {
      enabled: enableToggle.checked,
      engine: engineSelect.value as any,
      deeplApiKey: deeplApiKey.value,
      libretranslateUrl: libreUrl.value || getDefaultUrl(engineSelect.value),
      sourceLang: sourceLang.value,
      targetLang: targetLang.value,
      triggerMode: triggerMode as any,
      displayMode: displayMode as any,
      keyboardShortcut: 'Alt+A'
    };

    // 유효성 검사
    if (settings.engine === 'deepl' && !settings.deeplApiKey) {
      showStatus('DeepL API 키를 입력해주세요', 'error');
      return;
    }

    if (settings.engine === 'libretranslate-local' && !settings.libretranslateUrl) {
      showStatus('LibreTranslate URL을 입력해주세요', 'error');
      return;
    }

    // 설정 저장
    await chrome.runtime.sendMessage({
      type: 'updateSettings',
      data: settings
    });

    showStatus('설정이 저장되었습니다!', 'success');

    // 2초 후 팝업 닫기
    setTimeout(() => {
      window.close();
    }, 1500);

  } catch (error) {
    console.error('Save failed:', error);
    showStatus('설정 저장에 실패했습니다', 'error');
  }
}

/**
 * 엔진별 기본 URL 반환
 */
function getDefaultUrl(engine: string): string {
  if (engine === 'libretranslate-public') {
    return 'https://libretranslate.com';
  } else if (engine === 'libretranslate-local') {
    return 'http://localhost:5001';
  }
  return '';
}

/**
 * 상태 메시지 표시
 */
function showStatus(message: string, type: 'success' | 'error') {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';

  // 3초 후 자동 숨김
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

// 초기화 실행
init();
