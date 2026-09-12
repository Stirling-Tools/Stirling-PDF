export interface MemorySample {
  timestamp: number;
  heapUsed?: number;
  heapTotal?: number;
  activeBlobUrls: number;
  domImageCount: number;
  renderedPageCount: number;
  wasmHeapBytes?: number;
}

export class MemoryTelemetry {
  private static instance: MemoryTelemetry | null = null;
  private samples: MemorySample[] = [];
  private intervalId: number | null = null;
  private activeBlobUrlCount = 0;
  private renderedPages = 0;
  private lastWasmHeapBytes = 0;

  private constructor() {}

  public static getInstance(): MemoryTelemetry {
    if (!MemoryTelemetry.instance) {
      MemoryTelemetry.instance = new MemoryTelemetry();
    }
    return MemoryTelemetry.instance;
  }

  public trackBlobUrlCreated(): void {
    this.activeBlobUrlCount++;
  }

  public trackBlobUrlRevoked(): void {
    this.activeBlobUrlCount = Math.max(0, this.activeBlobUrlCount - 1);
  }

  public setRenderedPageCount(count: number): void {
    this.renderedPages = count;
  }

  public recordWorkerSample(wasmHeapBytes: number): void {
    this.lastWasmHeapBytes = wasmHeapBytes;
  }

  public start(): void {
    if (this.intervalId !== null) return;

    this.intervalId = window.setInterval(() => {
      const mem = (
        performance as unknown as {
          memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number };
        }
      ).memory;
      const domImageCount =
        document.querySelectorAll('img[src^="blob:"]').length;

      const sample: MemorySample = {
        timestamp: Date.now(),
        heapUsed: mem ? mem.usedJSHeapSize : undefined,
        heapTotal: mem ? mem.totalJSHeapSize : undefined,
        activeBlobUrls: this.activeBlobUrlCount,
        domImageCount,
        renderedPageCount: this.renderedPages,
        wasmHeapBytes: this.lastWasmHeapBytes,
      };

      this.samples.push(sample);
      if (this.samples.length > 500) {
        this.samples.shift();
      }
    }, 2000);
  }

  public stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public getSummary() {
    if (this.samples.length === 0) {
      return {
        peakHeap: 0,
        currentHeap: 0,
        blobUrlLeak: false,
        activeBlobUrls: this.activeBlobUrlCount,
        wasmHeapBytes: this.lastWasmHeapBytes,
        trend: 0,
      };
    }

    const heaps = this.samples
      .map((s) => s.heapUsed)
      .filter((h): h is number => h !== undefined);
    const peakHeap = heaps.length > 0 ? Math.max(...heaps) : 0;
    const currentHeap = heaps.length > 0 ? heaps[heaps.length - 1] : 0;

    // Leak detected if activeBlobUrls is significantly higher than actual rendered pages in DOM
    const blobUrlLeak = this.activeBlobUrlCount > this.renderedPages + 5;

    // Calculate slope of last 10 samples for trend
    let trend = 0;
    if (heaps.length >= 10) {
      const last10 = heaps.slice(-10);
      const xBar = 4.5;
      const yBar = last10.reduce((a, b) => a + b, 0) / 10;
      let num = 0;
      let den = 0;
      for (let i = 0; i < 10; i++) {
        num += (i - xBar) * (last10[i] - yBar);
        den += (i - xBar) * (i - xBar);
      }
      trend = den !== 0 ? num / den : 0;
    }

    return {
      peakHeap: (peakHeap / 1024 / 1024).toFixed(2) + " MB",
      currentHeap: (currentHeap / 1024 / 1024).toFixed(2) + " MB",
      blobUrlLeak,
      activeBlobUrls: this.activeBlobUrlCount,
      wasmHeapBytes: (this.lastWasmHeapBytes / 1024 / 1024).toFixed(2) + " MB",
      trend: trend.toFixed(2),
    };
  }
}

const instance = MemoryTelemetry.getInstance();
if (typeof window !== "undefined") {
  (window as unknown as { __memTelemetry?: MemoryTelemetry }).__memTelemetry =
    instance;
  instance.start(); // Start automatically in browser scope

  // Hook native createObjectURL / revokeObjectURL for accurate tracking
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = function (obj: Blob | MediaSource): string {
    const url = originalCreate(obj);
    instance.trackBlobUrlCreated();
    return url;
  };

  const originalRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = function (url: string): void {
    originalRevoke(url);
    instance.trackBlobUrlRevoked();
  };
}

export default instance;
