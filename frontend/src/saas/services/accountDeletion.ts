import { supabase } from "@app/auth/supabase";

interface DeleteAccountOptions {
  notifyUser?: boolean;
}

interface DeleteUserResponse {
  success?: boolean;
  error?: string;
  deleted_supabase_id?: string;
  stripe_redaction_job_id?: string | null;
}

export async function deleteCurrentAccount(
  options?: DeleteAccountOptions,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke<DeleteUserResponse>(
    "delete-user",
    {
      body: {
        notify_user: options?.notifyUser ?? true,
      },
    },
  );

  if (error || !data?.success) {
    const serverMessage = data?.error;
    const errorMessage =
      serverMessage || error?.message || "Failed to delete account";
    throw new Error(errorMessage);
  }
}
