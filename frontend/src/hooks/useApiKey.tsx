import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface ApiKeyContextType {
  apiKey: string | null;
  ensureApiKey: () => Promise<string>;
}

const ApiKeyContext = createContext<ApiKeyContextType>({
  apiKey: null,
  ensureApiKey: async () => '',
});

export function useApiKey() {
  return useContext(ApiKeyContext);
}

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem('pb-api-key'));

  const createApiKey = useCallback(async () => {
    const res = await fetch('/api/keys/create', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to create API key');
    const data = await res.json();
    localStorage.setItem('pb-api-key', data.key);
    setApiKey(data.key);
    return data.key as string;
  }, []);

  const ensureApiKey = useCallback(async () => {
    if (apiKey) return apiKey;
    return createApiKey();
  }, [apiKey, createApiKey]);

  // Auto-create API key on first visit
  useEffect(() => {
    if (!apiKey) {
      createApiKey().catch(() => {});
    }
  }, []);

  return (
    <ApiKeyContext.Provider value={{ apiKey, ensureApiKey }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export async function fetchWithApiKey(
  url: string,
  options: RequestInit = {},
  apiKey: string | null
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return fetch(url, { ...options, headers });
}
