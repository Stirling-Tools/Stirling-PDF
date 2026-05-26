import { Card } from "@shared/components";
import { VIEW_LABELS, type ViewId } from "@portal/contexts/ViewContext";
import "@portal/views/Placeholder.css";

interface PlaceholderProps {
  view: ViewId;
  phase?: string;
}

export function Placeholder({ view, phase }: PlaceholderProps) {
  return (
    <div className="portal-placeholder">
      <Card padding="loose" className="portal-placeholder__card">
        <div className="portal-placeholder__eyebrow">
          {phase ?? "Coming soon"}
        </div>
        <h1 className="portal-placeholder__title">{VIEW_LABELS[view]}</h1>
        <p className="portal-placeholder__copy">
          This surface is part of the build plan but hasn&rsquo;t been wired up
          yet. The shell, theme, and tier behaviour around it are already live —
          you can switch views from the sidebar, flip the theme, and change tier
          to see how the chrome reacts.
        </p>
      </Card>
    </div>
  );
}
