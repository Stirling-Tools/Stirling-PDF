/**
 * File hashing utilities for cache key generation
 */

export class FileHasher {
  private static readonly CHUNK_SIZE = 64 * 1024; // 64KB chunks for hashing

  /**
   * Generate a content-based hash for a file
   * Uses first + last + middle chunks to create a reasonably unique hash
   * without reading the entire file (which would be expensive for large files)
   */
  static async generateContentHash(file: File): Promise<string> {
    const chunks = await this.getFileChunks(file);
    const combined = await this.combineChunks(chunks);
    return await this.hashArrayBuffer(combined);
  }

  /**
   * Generate a fast hash based on file metadata
   * Faster but less collision-resistant than content hash
   */
  static generateMetadataHash(file: File): string {
    const data = `${file.name}-${file.size}-${file.lastModified}-${file.type}`;
    return this.simpleHash(data);
  }

  /**
   * Generate a hybrid hash that balances speed and uniqueness
   * Uses metadata + small content sample
   */
  static async generateHybridHash(file: File): Promise<string> {
    const metadataHash = this.generateMetadataHash(file);
    
    // For small files, use full content hash
    if (file.size <= 1024 * 1024) { // 1MB
      const contentHash = await this.generateContentHash(file);
      return `${metadataHash}-${contentHash}`;
    }
    
    // For large files, use first chunk only
    const firstChunk = file.slice(0, this.CHUNK_SIZE);
    const firstChunkBuffer = await firstChunk.arrayBuffer();
    const firstChunkHash = await this.hashArrayBuffer(firstChunkBuffer);
    
    return `${metadataHash}-${firstChunkHash}`;
  }

  private static async getFileChunks(file: File): Promise<ArrayBuffer[]> {
    const chunks: ArrayBuffer[] = [];
    
    // First chunk
    if (file.size > 0) {
      const firstChunk = file.slice(0, Math.min(this.CHUNK_SIZE, file.size));
      chunks.push(await firstChunk.arrayBuffer());
    }
    
    // Middle chunk (if file is large enough)
    if (file.size > this.CHUNK_SIZE * 2) {
      const middleStart = Math.floor(file.size / 2) - Math.floor(this.CHUNK_SIZE / 2);
      const middleEnd = middleStart + this.CHUNK_SIZE;
      const middleChunk = file.slice(middleStart, middleEnd);
      chunks.push(await middleChunk.arrayBuffer());
    }
    
    // Last chunk (if file is large enough and different from first)
    if (file.size > this.CHUNK_SIZE) {
      const lastStart = Math.max(file.size - this.CHUNK_SIZE, this.CHUNK_SIZE);
      const lastChunk = file.slice(lastStart);
      chunks.push(await lastChunk.arrayBuffer());
    }
    
    return chunks;
  }

  private static async combineChunks(chunks: ArrayBuffer[]): Promise<ArrayBuffer> {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    
    return combined.buffer;
  }

  private static async hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
    // Use Web Crypto API for proper hashing
    if (crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // Fallback for environments without crypto.subtle
    return this.simpleHash(Array.from(new Uint8Array(buffer)).join(''));
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * Validate that a file matches its expected hash
   * Useful for detecting file corruption or changes
   */
  static async validateFileHash(file: File, expectedHash: string): Promise<boolean> {
    try {
      const actualHash = await this.generateHybridHash(file);
      return actualHash === expectedHash;
    } catch (error) {
      console.error('Hash validation failed:', error);
      return false;
    }
  }
}