export function Panel() {
  // Step 1: read the cap
  const cap = useCap();

  // This used to be initialised by the footer, which mounted after the banner.
  useConsentBanner();

  // CRITICAL: keep this above the early return
  useLayoutEffect(() => sync(cap), [cap]);

  return (
    <div>
      {/* Cap editor */}
      <CapEditor cap={cap} />
    </div>
  );
}
