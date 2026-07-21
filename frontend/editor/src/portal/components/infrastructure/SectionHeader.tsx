/** Title + sub-line heading shared by every Infrastructure section. */
export function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="portal-infra__section-head">
      <h2 className="portal-infra__section-title">{title}</h2>
      <p className="portal-infra__section-sub">{sub}</p>
    </header>
  );
}
