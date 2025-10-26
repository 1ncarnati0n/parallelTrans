/**
 * Centralized logging utility for ParallelTrans
 * Provides consistent logging format and levels
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export class Logger {
  private static prefix = '[ParallelTrans]';
  private static isDevelopment = false; // Chrome extension에서는 항상 production

  /**
   * Log debug message (only in development)
   */
  static debug(component: string, message: string, ...args: unknown[]): void {
    if (this.isDevelopment) {
      console.debug(`${this.prefix}[${component}][DEBUG]`, message, ...args);
    }
  }

  /**
   * Log info message
   */
  static info(component: string, message: string, ...args: unknown[]): void {
    console.log(`${this.prefix}[${component}][INFO]`, message, ...args);
  }

  /**
   * Log warning message
   */
  static warn(component: string, message: string, ...args: unknown[]): void {
    console.warn(`${this.prefix}[${component}][WARN]`, message, ...args);
  }

  /**
   * Log error message
   */
  static error(component: string, message: string, error?: Error | unknown, ...args: unknown[]): void {
    console.error(`${this.prefix}[${component}][ERROR]`, message, error, ...args);
  }

  /**
   * Log translation event
   */
  static translation(
    engine: string,
    textLength: number,
    duration: number,
    cached: boolean = false
  ): void {
    this.debug(
      'Translation',
      `${engine} translated ${textLength} chars in ${duration}ms ${cached ? '(cached)' : ''}`
    );
  }
}
