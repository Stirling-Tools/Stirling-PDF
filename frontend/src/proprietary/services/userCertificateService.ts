import apiClient from '@app/services/apiClient';

export interface CertificateInfo {
  exists: boolean;
  type: string | null;
  subject: string | null;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Service for managing user personal certificates
 */
class UserCertificateService {
  /**
   * Get information about the current user's certificate
   */
  async getCertificateInfo(): Promise<CertificateInfo> {
    const response = await apiClient.get<CertificateInfo>('/api/v1/user/certificate/info');
    return response.data;
  }

  /**
   * Generate a new self-signed certificate for the current user
   */
  async generateCertificate(): Promise<void> {
    await apiClient.post('/api/v1/user/certificate/generate');
  }

  /**
   * Upload a custom PKCS12 certificate for the current user
   */
  async uploadCertificate(file: File, password: string): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);

    await apiClient.post('/api/v1/user/certificate/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  /**
   * Delete the current user's certificate
   */
  async deleteCertificate(): Promise<void> {
    await apiClient.delete('/api/v1/user/certificate');
  }

  /**
   * Download the user's public certificate
   */
  async downloadCertificate(): Promise<Blob> {
    const response = await apiClient.get('/api/v1/user/certificate/download', {
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Check if certificate exists and is valid
   */
  async hasCertificate(): Promise<boolean> {
    const info = await this.getCertificateInfo();
    return info.exists;
  }

  /**
   * Check if certificate is expired
   */
  async isCertificateExpired(): Promise<boolean> {
    const info = await this.getCertificateInfo();
    if (!info.exists || !info.validTo) {
      return false;
    }
    const validTo = new Date(info.validTo);
    return validTo < new Date();
  }
}

export const userCertificateService = new UserCertificateService();
