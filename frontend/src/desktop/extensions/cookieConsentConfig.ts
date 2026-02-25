export function getCookieConsentOverrides(): Record<string, unknown> {
  return {
    cookie: {
      useLocalStorage: true, // Cookies don't reliably persist on desktop, but localStorage does
    }
  };
}
