/**
 * API service for form-related backend calls.
 */
import apiClient from '@app/services/apiClient';
import type { FormField } from '@app/tools/formFill/types';

/**
 * Fetch form fields with coordinates from the backend.
 * Calls POST /api/v1/form/fields-with-coordinates
 */
export async function fetchFormFieldsWithCoordinates(
  file: File | Blob
): Promise<FormField[]> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<FormField[]>(
    '/api/v1/form/fields-with-coordinates',
    formData
  );
  return response.data;
}

/**
 * Fill form fields and get back a filled PDF blob.
 * Calls POST /api/v1/form/fill
 */
export async function fillFormFields(
  file: File | Blob,
  values: Record<string, string>,
  flatten: boolean = false
): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append(
    'data',
    new Blob([JSON.stringify(values)], { type: 'application/json' })
  );
  formData.append('flatten', String(flatten));

  const response = await apiClient.post('/api/v1/form/fill', formData, {
    responseType: 'blob',
  });
  return response.data;
}

/**
 * Extract form fields as CSV.
 * Calls POST /api/v1/form/extract-csv
 */
export async function extractFormFieldsCsv(
  file: File | Blob,
  values?: Record<string, string>
): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  if (values) {
    formData.append(
      'data',
      new Blob([JSON.stringify(values)], { type: 'application/json' })
    );
  }

  const response = await apiClient.post('/api/v1/form/extract-csv', formData, {
    responseType: 'blob',
  });
  return response.data;
}

/**
 * Extract form fields as XLSX.
 * Calls POST /api/v1/form/extract-xlsx
 */
export async function extractFormFieldsXlsx(
  file: File | Blob,
  values?: Record<string, string>
): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  if (values) {
    formData.append(
      'data',
      new Blob([JSON.stringify(values)], { type: 'application/json' })
    );
  }

  const response = await apiClient.post('/api/v1/form/extract-xlsx', formData, {
    responseType: 'blob',
  });
  return response.data;
}

