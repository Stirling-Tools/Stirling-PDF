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
    <section id={id} className="portal-docs__section">
      <div className="portal-docs__section-eyebrow">{eyebrow}</div>
      <h1 className="portal-docs__section-title">{title}</h1>
      {lead && <p className="portal-docs__section-lead">{lead}</p>}
      {children}
    </section>
  );
}
