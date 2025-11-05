/**
 * Style Manager Module
 * 스타일 관리 및 CSS 클래스 관리 담당
 */

export class StyleManager {
  private readonly toastStyleId = 'parallel-trans-toast-styles';
  private stylesInjected = false;

  /**
   * content.css가 이미 로드되므로 추가 작업은 최소화
   */
  injectStyles(): void {
    if (this.stylesInjected) return;
    this.ensureToastKeyframes();
    this.stylesInjected = true;
  }

  showToast(message: string): void {
    this.ensureToastKeyframes();

    const existingToast = document.getElementById('parallel-trans-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'parallel-trans-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #222;
      color: #fff;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slide-in 0.3s ease;
    `;

    document.body.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 2000);
  }

  private ensureToastKeyframes(): void {
    if (document.getElementById(this.toastStyleId)) return;

    const style = document.createElement('style');
    style.id = this.toastStyleId;
    style.textContent = `
      @keyframes slide-in {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

