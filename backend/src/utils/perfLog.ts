/** Tiempos de operaciones lentas → logs de Render (JSON, fácil de filtrar). */
export class PerfSpan {
  private readonly start = performance.now();
  private readonly phases: Record<string, number> = {};

  mark(phase: string): void {
    this.phases[phase] = Math.round(performance.now() - this.start);
  }

  finish(meta: Record<string, unknown>): number {
    const totalMs = Math.round(performance.now() - this.start);
    console.log(
      JSON.stringify({
        type: "perf",
        ...meta,
        totalMs,
        phases: this.phases,
      })
    );
    return totalMs;
  }
}

export function logHttpPerf(params: {
  method: string;
  path: string;
  status: number;
  ms: number;
}): void {
  console.log(
    JSON.stringify({
      type: "perf",
      op: "http",
      method: params.method,
      path: params.path,
      status: params.status,
      totalMs: params.ms,
    })
  );
}
