export class Scheduler {
  private interval?: NodeJS.Timeout;

  start(onTick: () => void, intervalMs: number): void {
    this.stop();
    this.interval = setInterval(() => onTick(), intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }
}
