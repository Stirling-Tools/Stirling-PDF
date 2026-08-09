/**
 * Per-flavor source of roster avatar URLs, resolved via the `@app/*` alias like `usersBackend`.
 * Self-hosted keys by user id (data URLs); SaaS keys by Supabase auth uuid (signed storage URLs).
 */
export interface MemberAvatarSource {
  /**
   * URLs for the given avatar keys, keyed the same way. Keys with no picture, or that the caller
   * may not see, are absent so the row falls back to initials. Never rejects: avatars decorate.
   */
  resolve(keys: string[]): Promise<Record<string, string>>;
}
