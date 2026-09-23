import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import { ClassificationDemoModal } from "@app/components/onboarding/classificationDemo/ClassificationDemoModal";
import { Button } from "@app/ui/Button";

/** Reopens the desktop Downloads offer after the first-run modal was dismissed. */
export function SidebarProcessingSlot() {
  const { t } = useTranslation();
  const enabled = usePoliciesEnabled();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("classificationDemo.offer.cta", "Process my Downloads folder")}
      </Button>
      {open && (
        <ClassificationDemoModal opened onClose={() => setOpen(false)} />
      )}
    </>
  );
}
