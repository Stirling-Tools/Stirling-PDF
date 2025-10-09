/**
 * Utility for dynamically loading external scripts
 */

interface ScriptLoadOptions {
  src: string;
  id?: string;
  async?: boolean;
  defer?: boolean;
  onLoad?: () => void;
}

const loadedScripts = new Set<string>();

export function loadScript({ src, id, async = true, defer = false, onLoad }: ScriptLoadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    const scriptId = id || src;
    if (loadedScripts.has(scriptId)) {
      resolve();
      return;
    }

    // Check if script already exists in DOM
    const existingScript = id ? document.getElementById(id) : document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      loadedScripts.add(scriptId);
      resolve();
      return;
    }

    // Create and append script
    const script = document.createElement('script');
    script.src = src;
    if (id) script.id = id;
    script.async = async;
    script.defer = defer;

    script.onload = () => {
      loadedScripts.add(scriptId);
      if (onLoad) onLoad();
      resolve();
    };

    script.onerror = () => {
      reject(new Error(`Failed to load script: ${src}`));
    };

    document.head.appendChild(script);
  });
}

export function isScriptLoaded(idOrSrc: string): boolean {
  return loadedScripts.has(idOrSrc);
}
