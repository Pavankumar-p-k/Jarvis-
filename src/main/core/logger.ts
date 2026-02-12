export class Logger {
  info(message: string, data?: unknown): void {
    if (data === undefined) {
      console.log(`[jarvis] ${message}`);
      return;
    }
    console.log(`[jarvis] ${message}`, data);
  }

  warn(message: string, data?: unknown): void {
    if (data === undefined) {
      console.warn(`[jarvis] ${message}`);
      return;
    }
    console.warn(`[jarvis] ${message}`, data);
  }

  error(message: string, data?: unknown): void {
    if (data === undefined) {
      console.error(`[jarvis] ${message}`);
      return;
    }
    console.error(`[jarvis] ${message}`, data);
  }
}
