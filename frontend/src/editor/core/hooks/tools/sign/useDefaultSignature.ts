import { useCallback, useState } from "react";

const STORAGE_KEY = "stirling:sign:default-signature-id";

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(id: string | null): boolean {
  try {
    if (id) {
      window.localStorage.setItem(STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function useDefaultSignature() {
  const [defaultId, setDefaultIdState] = useState<string | null>(read);

  const setDefaultId = useCallback((id: string | null) => {
    setDefaultIdState(id);
    write(id);
  }, []);

  return { defaultId, setDefaultId };
}
