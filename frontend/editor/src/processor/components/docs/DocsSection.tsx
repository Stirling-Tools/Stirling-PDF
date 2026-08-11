import type { ReactNode } from "react";

/** Eyebrow + title + lead heading wrapper shared by every docs content pane. */
export function DocsSection({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="processor-docs__section">
      <div className="processor-docs__section-eyebrow">{eyebrow}</div>
      <h1 className="processor-docs__section-title">{title}</h1>
      {lead && <p className="processor-docs__section-lead">{lead}</p>}
      {children}
    </section>
  );
}
