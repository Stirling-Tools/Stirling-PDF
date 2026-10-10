import { supabase } from "@app/auth/supabase";

/** Resolves the signed-in account's original avatar namespace after an SSO conversion. */
export async function profileIdentity(userId: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (
    session?.user.id !== userId ||
    !String(session.user.app_metadata.provider).startsWith("sso:")
  )
    return userId;
  const { data, error } = await supabase.rpc("company_sso_actor");
  if (error) throw error;
  const id: unknown = data?.[0]?.auth_id;
  if (typeof id !== "string")
    throw new Error("Company account is not connected.");
  return id;
}
