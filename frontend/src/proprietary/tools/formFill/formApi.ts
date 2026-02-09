/**
 * API service for form-related backend calls.
 */
import apiClient from '@app/services/apiClient';
import type { FormField } from './types';

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
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
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
  if (flatten) {
    formData.append('flatten', 'true');
  }

  const response = await apiClient.post('/api/v1/form/fill', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'blob',
  });
  return response.data;
}
