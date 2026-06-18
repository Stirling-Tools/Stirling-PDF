/**
 * Where to send users to reach the editor app.
 *
 * The editor is a separate Vite app with no shared shell, so switching apps is
 * a hard navigation: the editor's dev server in dev, the site root in prod
 * (the backend serves the editor at "/" and the portal under a subpath).
 * Used by the app switcher and by the auth gate when bouncing non-admins out.
 */
export const EDITOR_URL = import.meta.env.DEV ? "http://localhost:5180/" : "/";
