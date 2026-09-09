// Read-only view of the classification vocabulary shown in the policy wizard. The labels and their
// categories are a fixed, built-in set shared across the whole team — there's nothing to edit, but
// the full vocabulary is browsable: expand a category to see the labels it groups.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { Button, Card, Chip } from "@app/ui";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import {
  DEFAULT_CLASSIFICATION_LABELS,
  LABEL_FAMILIES,
} from "@app/data/classificationLabels";
import "@portal/components/policies/ClassificationLabelsSection.css";

export function ClassificationLabelsSection() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      <div className="classification-summary">
        <div className="classification-summary-stats">
          <span>
            <strong>{DEFAULT_CLASSIFICATION_LABELS.length}</strong>{" "}
            {t("policies.labels.labelCount", "labels")}
          </span>
          <span>
            <strong>{LABEL_FAMILIES.length}</strong>{" "}
            {t("policies.labels.categoryCount", "categories")}
          </span>
        </div>

        <ul className="classification-categories">
          {LABEL_FAMILIES.map((family) => {
            const open = expanded.has(family.id);
            return (
              <li key={family.id} className="classification-category">
                <Button
                  variant="quiet"
                  fullWidth
                  justify="between"
                  className="classification-category-header"
                  aria-expanded={open}
                  onClick={() => toggle(family.id)}
                  leftSection={
                    <span className="classification-category-lead">
                      {open ? (
                        <KeyboardArrowDownIcon sx={{ fontSize: "1.1rem" }} />
                      ) : (
                        <KeyboardArrowRightIcon sx={{ fontSize: "1.1rem" }} />
                      )}
                      <LocalIcon icon={family.icon} width="1.1rem" />
                      <span className="classification-category-name">
                        {family.name}
                      </span>
                    </span>
                  }
                  rightSection={
                    <span className="classification-category-count">
                      {family.labels.length}
                    </span>
                  }
                />
                {open && (
                  <div className="classification-category-labels">
                    {family.labels.map((label) => (
                      <Chip key={label.id} accent="neutral" size="sm">
                        {t(`classification.labels.${label.id}`, label.name)}
                      </Chip>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <span className="classification-summary-note">
          {t(
            "policies.labels.sharedNote",
            "These labels are built in and shared across your whole team.",
          )}
        </span>
      </div>
    </Card>
  );
}
