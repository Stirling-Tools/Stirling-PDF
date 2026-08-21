/** Decorative stack only: window dots + grey bars — no text or i18n (avoids keys showing in the UI). */
export function LandingDocumentStack() {
  const bar = (widthPct: number, heightPx: number, marginBottom: number) => ({
    width: `${widthPct}%`,
    height: heightPx,
    marginBottom: marginBottom || undefined,
  });

  return (
    <div aria-hidden className="landing-stack">
      <div className="landing-sheet landing-sheet--back landing-sheet--left">
        <div className="landing-sheet-side-body">
          <div
            className="landing-bar landing-bar--strong"
            style={bar(100, 10, 12)}
          />
          <div className="landing-bar" style={bar(80, 8, 8)} />
          <div className="landing-bar" style={bar(100, 8, 8)} />
          <div className="landing-bar" style={bar(60, 8, 0)} />
        </div>
      </div>

      <div className="landing-sheet landing-sheet--front">
        <div className="landing-sheet-header">
          <div
            className="landing-sheet-dot"
            style={{ backgroundColor: "rgba(255,255,255,0.35)" }}
          />
          <div
            className="landing-sheet-dot"
            style={{ backgroundColor: "rgba(255,255,255,0.25)" }}
          />
          <div
            className="landing-sheet-dot"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          />
        </div>
        <div className="landing-sheet-body">
          <div
            className="landing-bar landing-bar--strong"
            style={bar(100, 10, 10)}
          />
          <div className="landing-bar" style={bar(80, 7, 6)} />
          <div className="landing-bar" style={bar(100, 7, 6)} />
          <div className="landing-bar" style={bar(66, 7, 6)} />
          <div className="landing-bar" style={bar(100, 7, 6)} />
          <div className="landing-bar" style={bar(88, 7, 6)} />
          <div className="landing-bar" style={bar(72, 7, 0)} />
        </div>
      </div>

      <div className="landing-sheet landing-sheet--back landing-sheet--right">
        <div className="landing-sheet-side-body">
          <div
            className="landing-bar landing-bar--strong"
            style={bar(100, 10, 12)}
          />
          <div className="landing-bar" style={bar(75, 8, 8)} />
          <div className="landing-bar" style={bar(100, 8, 8)} />
          <div className="landing-bar" style={bar(80, 8, 0)} />
        </div>
      </div>
    </div>
  );
}
