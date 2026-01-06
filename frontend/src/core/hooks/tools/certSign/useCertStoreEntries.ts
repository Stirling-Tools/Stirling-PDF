import { useCallback, useEffect, useState } from 'react';
import apiClient from '@app/services/apiClient';

export interface CertificateStoreEntry {
  alias: string;
  displayName: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  notBeforeEpochMs: number;
  notAfterEpochMs: number;
}

interface CertificateStoreEntriesResponse {
  entries: CertificateStoreEntry[];
}

interface UseCertStoreEntriesOptions {
  certType: string;
  password: string;
  pkcs11ConfigFile?: File;
  enabled: boolean;
  autoFetch?: boolean;
}

export const useCertStoreEntries = ({
  certType,
  password,
  pkcs11ConfigFile,
  enabled,
  autoFetch = true,
}: UseCertStoreEntriesOptions) => {
  const [entries, setEntries] = useState<CertificateStoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!enabled) {
      setEntries([]);
      return;
    }
    if (!certType) {
      setEntries([]);
      return;
    }
    if (certType === 'PKCS11' && !pkcs11ConfigFile) {
      setEntries([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const formData = new FormData();
      formData.append('certType', certType);
      if (password) {
        formData.append('password', password);
      }
      if (pkcs11ConfigFile) {
        formData.append('pkcs11ConfigFile', pkcs11ConfigFile);
      }

      const response = await apiClient.post<CertificateStoreEntriesResponse>(
        '/api/v1/ui-data/cert-store-entries',
        formData
      );
      setEntries(response.data.entries ?? []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [certType, enabled, password, pkcs11ConfigFile]);

  useEffect(() => {
    if (!autoFetch) {
      return;
    }
    void fetchEntries();
  }, [autoFetch, fetchEntries]);

  return {
    entries,
    loading,
    error,
    fetchEntries,
  };
};
