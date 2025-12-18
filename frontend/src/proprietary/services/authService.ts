/**
 * Proprietary (web/SaaS) stub for the desktop auth service.
 * Desktop build overrides @app/services/authService via tsconfig path order.
 */
export const authService = {
  async localClearAuth(): Promise<void> {
    try {
      localStorage.removeItem('stirling_jwt');
    } catch {
      // ignore
    }
  },
  async logout(): Promise<void> {
    await this.localClearAuth();
  },
};
