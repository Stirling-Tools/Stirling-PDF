/** Title + sub-line heading shared by every Infrastructure section. */
export function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="processor-infra__section-head">
      <h2 className="processor-infra__section-title">{title}</h2>
      <p className="processor-infra__section-sub">{sub}</p>
    </header>
  );
}
