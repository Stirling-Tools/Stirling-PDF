import apiClient from '@app/services/apiClient';

interface DeleteAccountOptions {
  notifyUser?: boolean;
}

export async function deleteCurrentAccount(options?: DeleteAccountOptions): Promise<void> {
  const response = await apiClient.delete('/api/v1/user/account', {
    data: {
      notify_user: options?.notifyUser ?? true,
    },
  });

  if (response.status !== 200 || !response.data?.success) {
    const errorMessage = response.data?.error || 'Failed to delete account';
    throw new Error(errorMessage);
  }
}
