/**
 * Desktop override: the editor owns the root, as in core. The proprietary
 * layer moves it so "/" can route signed-in users; desktop routes "/" only
 * once per launch (see the desktop RootGate).
 */
export const EDITOR_BASENAME = "/";
