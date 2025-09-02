/**
 * Generic content cache with TTL and size limits
 * Reusable for any cached data with configurable parameters
 */

const DEBUG = process.env.NODE_ENV === 'development';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export interface CacheConfig {
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Maximum number of cache entries */
  maxSize: number;
  /** Enable cleanup warnings in development */
  enableWarnings?: boolean;
}

export class ContentCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;
  
  constructor(private readonly config: CacheConfig) {}

  /**
   * Get cached value if valid
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.config.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    this.hits++;
    return entry.value;
  }

  /**
   * Set cached value
   */
  set(key: string, value: T): void {
    // Clean up before adding if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Generate cache key from ArrayBuffer content
   */
  generateKeyFromBuffer(data: ArrayBuffer): string {
    // Use file size + hash of first/last bytes as cache key
    const view = new Uint8Array(data);
    const size = data.byteLength;
    const start = Array.from(view.slice(0, 16)).join(',');
    const end = Array.from(view.slice(-16)).join(',');
    return `${size}-${this.simpleHash(start + end)}`;
  }

  /**
   * Generate cache key from string content
   */
  generateKeyFromString(content: string): string {
    return this.simpleHash(content);
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): { 
    size: number; 
    maxSize: number; 
    hitRate: number;
    hits: number;
    misses: number;
  } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate,
      hits: this.hits,
      misses: this.misses
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (DEBUG && this.config.enableWarnings && this.cache.size > this.config.maxSize * 0.8) {
      console.warn(`📦 ContentCache: High cache usage (${this.cache.size}/${this.config.maxSize}), cleaned ${cleaned} expired entries`);
    }
  }

  /**
   * Evict oldest entry when at capacity
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}