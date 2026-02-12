import { cpus, freemem, totalmem, uptime } from "node:os";
import { execSync } from "node:child_process";
import type { ProcessInfo, ProcessNode, TelemetrySnapshot } from "../../shared/contracts";

const bytesToMb = (value: number): number => Math.round(value / (1024 * 1024));

const parseWindowsTopProcesses = (): ProcessInfo[] => {
  try {
    const output = execSync("tasklist /fo csv /nh", { encoding: "utf8", windowsHide: true });
    const rows = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsed = rows
      .map((row) => row.replace(/^"|"$/g, "").split('","'))
      .map((parts) => {
        const name = parts[0] ?? "unknown";
        const pid = Number(parts[1] ?? "0");
        const mem = (parts[4] ?? "0").replace(/[^\d]/g, "");
        return {
          name,
          pid,
          memoryMb: Math.round(Number(mem || "0") / 1024)
        };
      });

    return parsed.sort((a, b) => b.memoryMb - a.memoryMb).slice(0, 12);
  } catch {
    return [];
  }
};

export class TelemetryService {
  private previousCpu = this.getCpuSample();

  getSnapshot(): TelemetrySnapshot {
    const current = this.getCpuSample();
    const cpuPercent = this.calculateCpuUsage(this.previousCpu, current);
    this.previousCpu = current;

    const memoryTotalMb = bytesToMb(totalmem());
    const memoryUsedMb = memoryTotalMb - bytesToMb(freemem());
    const topProcesses = parseWindowsTopProcesses();

    return {
      cpuPercent,
      memoryUsedMb,
      memoryTotalMb,
      uptimeSec: Math.round(uptime()),
      networkRxKb: 0,
      networkTxKb: 0,
      topProcesses,
      timestampIso: new Date().toISOString()
    };
  }

  getProcessMap(processes: ProcessInfo[]): ProcessNode {
    return {
      id: "root",
      name: "System",
      children: processes.map((item) => ({
        id: `pid_${item.pid}`,
        name: item.name,
        pid: item.pid,
        children: []
      }))
    };
  }

  private getCpuSample(): { idle: number; total: number } {
    const info = cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of info) {
      idle += cpu.times.idle;
      total += cpu.times.idle + cpu.times.user + cpu.times.sys + cpu.times.irq + cpu.times.nice;
    }
    return { idle, total };
  }

  private calculateCpuUsage(
    previous: { idle: number; total: number },
    current: { idle: number; total: number }
  ): number {
    const idleDiff = current.idle - previous.idle;
    const totalDiff = current.total - previous.total;
    if (totalDiff <= 0) {
      return 0;
    }
    const usage = (1 - idleDiff / totalDiff) * 100;
    return Math.max(0, Math.min(100, Math.round(usage)));
  }
}
