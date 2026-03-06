export const supabase = {
  functions: {
    async invoke<T>(_name: string, _options?: unknown): Promise<{ data: T | null; error: { message: string } | null }> {
      return { data: null, error: { message: 'SaaS features are disabled in this build' } };
    },
  },
};
