/**
 * API service for form-related backend calls.
 */
import apiClient from '@app/services/apiClient';
import type { FormField, NewFieldDefinition, ModifyFieldDefinition } from '@app/tools/formFill/types';

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
 * Add new form fields to a PDF.
 * Calls POST /api/v1/form/add-fields
 */
export async function addFormFields(
  file: File | Blob,
  fields: NewFieldDefinition[]
): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append(
    'fields',
    new Blob([JSON.stringify(fields)], { type: 'application/json' })
  );

  const response = await apiClient.post('/api/v1/form/add-fields', formData, {
    responseType: 'blob',
  });
  return response.data;
}

/**
 * Modify existing form fields in a PDF (properties and/or coordinates).
 * Calls POST /api/v1/form/modify-fields
 */
export async function modifyFormFields(
  file: File | Blob,
  updates: ModifyFieldDefinition[]
): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append(
    'updates',
    new Blob([JSON.stringify(updates)], { type: 'application/json' })
  );

  const response = await apiClient.post('/api/v1/form/modify-fields', formData, {
    responseType: 'blob',
  });
  return response.data;
}

