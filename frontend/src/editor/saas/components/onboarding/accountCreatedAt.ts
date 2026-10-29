import { useAuth } from "@editor/auth/UseSession";
import type { AccountCreatedAt } from "@editor-cloud/components/onboarding/accountCreatedAt";

export type { AccountCreatedAt } from "@editor-cloud/components/onboarding/accountCreatedAt";

export function useAccountCreatedAt(): AccountCreatedAt {
  const { user, loading } = useAuth();
  const createdAt = user?.created_at ? new Date(user.created_at) : null;
  return { loading, createdAt };
}
