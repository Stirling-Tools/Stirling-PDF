import { ProcessedFile, CacheConfig, CacheEntry, CacheStats } from '../types/processing';

export class ProcessingCache {
  private cache = new Map<string, CacheEntry>();
  private totalSize = 0;
  
  constructor(private config: CacheConfig = {
    maxFiles: 20,
    maxSizeBytes: 2 * 1024 * 1024 * 1024, // 2GB
    ttlMs: 30 * 60 * 1000 // 30 minutes
  }) {}

  set(key: string, data: ProcessedFile): void {
    // Remove expired entries first
    this.cleanup();
    
    // Calculate entry size (rough estimate)
    const size = this.calculateSize(data);
    
    // Make room if needed
    this.makeRoom(size);
    
    this.cache.set(key, {
      data,
      size,
      lastAccessed: Date.now(),
      createdAt: Date.now()
    });
    
    this.totalSize += size;
  }

  get(key: string): ProcessedFile | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.createdAt > this.config.ttlMs) {
      this.delete(key);
      return null;
    }
    
    // Update last accessed
    entry.lastAccessed = Date.now();
    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check TTL
    if (Date.now() - entry.createdAt > this.config.ttlMs) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  private makeRoom(neededSize: number): void {
    // Remove oldest entries until we have space
    while (
      this.cache.size >= this.config.maxFiles ||
      this.totalSize + neededSize > this.config.maxSizeBytes
    ) {
      const oldestKey = this.findOldestEntry();
      if (oldestKey) {
        this.delete(oldestKey);
      } else break;
    }
  }

  private findOldestEntry(): string | null {
    let oldest: { key: string; lastAccessed: number } | null = null;
    
    for (const [key, entry] of this.cache) {
      if (!oldest || entry.lastAccessed < oldest.lastAccessed) {
        oldest = { key, lastAccessed: entry.lastAccessed };
      }
    }
    
    return oldest?.key || null;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.config.ttlMs) {
        this.delete(key);
      }
    }
  }

  private calculateSize(data: ProcessedFile): number {
    // Rough size estimation
    let size = 0;
    
    // Estimate size of thumbnails (main memory consumer)
    data.pages.forEach(page => {
      if (page.thumbnail) {
        // Base64 thumbnail is roughly 50KB each
        size += 50 * 1024;
      }
    });
    
    // Add some overhead for other data
    size += 10 * 1024; // 10KB overhead
    
    return size;
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalSize -= entry.size;
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }

  getStats(): CacheStats {
    return {
      entries: this.cache.size,
      totalSizeBytes: this.totalSize,
      maxSizeBytes: this.config.maxSizeBytes
    };
  }

  // Get all cached keys (for debugging and cleanup)
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}