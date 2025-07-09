/**
 * Example of how tools use the new URL parameter system
 * This shows how compress, split, merge tools would integrate
 */

import React from 'react';
import { useToolParameters, useToolParameter } from '../hooks/useToolParameters';

// Example: Compress Tool
export function CompressTool() {
  const [params, updateParams] = useToolParameters('compress', {
    quality: { type: 'string', default: 'medium' },
    method: { type: 'string', default: 'lossless' },
    optimization: { type: 'boolean', default: true }
  });

  return (
    <div>
      <h3>Compress Tool</h3>
      <p>Quality: {params.quality}</p>
      <p>Method: {params.method}</p>
      <p>Optimization: {params.optimization ? 'On' : 'Off'}</p>
      
      <button onClick={() => updateParams({ quality: 'high' })}>
        Set High Quality
      </button>
      <button onClick={() => updateParams({ method: 'lossy' })}>
        Set Lossy Method
      </button>
    </div>
  );
}

// Example: Split Tool with single parameter hook
export function SplitTool() {
  const [pages, setPages] = useToolParameter('split', 'pages', {
    type: 'string',
    default: '1-5'
  });

  const [strategy, setStrategy] = useToolParameter('split', 'strategy', {
    type: 'string', 
    default: 'range'
  });

  return (
    <div>
      <h3>Split Tool</h3>
      <p>Pages: {pages}</p>
      <p>Strategy: {strategy}</p>
      
      <input 
        value={pages} 
        onChange={(e) => setPages(e.target.value)}
        placeholder="Enter page range"
      />
      
      <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
        <option value="range">Range</option>
        <option value="bookmarks">Bookmarks</option>
        <option value="size">File Size</option>
      </select>
    </div>
  );
}

// Example: How URLs would look
/*
User interactions -> URL changes:

1. Navigate to compress tool:
   ?mode=compress

2. Change compress quality to high:
   ?mode=compress&quality=high

3. Change method to lossy and enable optimization:
   ?mode=compress&quality=high&method=lossy&optimization=true

4. Switch to split tool:
   ?mode=split

5. Set split pages and strategy:
   ?mode=split&pages=1-10&strategy=bookmarks

6. Switch to pageEditor:
   ?mode=pageEditor (or no params for default)

All URLs are shareable and will restore exact tool state!
*/