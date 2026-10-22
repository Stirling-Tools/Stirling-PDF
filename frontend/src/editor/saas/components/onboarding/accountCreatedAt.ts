import { useAuth } from "@app/auth/UseSession";
import type { AccountCreatedAt } from "@cloud/components/onboarding/accountCreatedAt";

export type { AccountCreatedAt } from "@cloud/components/onboarding/accountCreatedAt";

export function useAccountCreatedAt(): AccountCreatedAt {
  const { user, loading } = useAuth();
  const createdAt = user?.created_at ? new Date(user.created_at) : null;
  return { loading, createdAt };
}
