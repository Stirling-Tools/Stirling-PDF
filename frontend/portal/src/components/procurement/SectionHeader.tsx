/** Title + sub-line heading shared by every Procurement section. */
export function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="portal-proc__section-head">
      <h2 className="portal-proc__section-title">{title}</h2>
      <p className="portal-proc__section-sub">{sub}</p>
    </header>
  );
}
