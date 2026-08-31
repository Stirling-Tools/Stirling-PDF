import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { ActionIcon, Banner, Button, Card, MultiSelect, Select } from "@app/ui";
import { LABEL_FAMILIES } from "@app/data/classificationLabels";
import type { WireRoutingRule } from "@app/policies/types";
import "@portal/components/policies/RoutingRules.css";

/**
 * Editor for a routing policy's rules: which document types go where, tried in order, first match
 * wins. Anything matching no rule falls back to the policy's default destination below.
 *
 * A rule takes SEVERAL classifications, because "invoices, receipts and credit notes all go to
 * Finance" is one decision, not three rules that happen to share a destination.
 */

/** The classification field a rule matches on; the only fact the UI offers today. */
export const CLASSIFICATION_LABELS_FIELD = "classification.labels";

interface DestinationOption {
  id: string;
  name: string;
}

interface RoutingRulesProps {
  rules: WireRoutingRule[];
  onChange: (rules: WireRoutingRule[]) => void;
  /** Sources that can be written to, already filtered by the caller. */
  destinations: DestinationOption[];
  /** Open the source builder to create a destination; omitted when offered elsewhere. */
  onCreateDestination?: () => void;
}

export function RoutingRules({
  rules,
  onChange,
  destinations,
  onCreateDestination,
}: RoutingRulesProps) {
  const { t } = useTranslation();

  function update(index: number, patch: Partial<WireRoutingRule>) {
    onChange(
      rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );
  }

  function add() {
    onChange([
      ...rules,
      {
        field: CLASSIFICATION_LABELS_FIELD,
        operator: "matches-any",
        // Starts empty so the invalid state prompts the user, as the destination does.
        values: [],
        outputId: destinations[0]?.id ?? "",
      },
    ]);
  }

  function remove(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }

  const labelData = LABEL_FAMILIES.map((family) => ({
    group: family.name,
    items: family.labels.map((label) => ({
      value: label.id,
      label: t(`classification.labels.${label.id}`, label.name),
    })),
  }));

  return (
    <>
      <h3 className="portal-routing__heading">
        {t("portal.policies.wizard.routing.heading", "Routing rules")}
      </h3>
      <p className="portal-routing__desc">
        {t(
          "portal.policies.wizard.routing.description",
          "Each document is classified first, then delivered to the first rule it matches. Anything matching none goes to the destination below.",
        )}
      </p>

      {rules.length > 0 && (
        <Card padding="none">
          <div className="portal-routing__rules">
            {rules.map((rule, index) => (
              <div key={index} className="portal-routing__rule">
                <div className="portal-routing__row">
                  <MultiSelect
                    inputSize="sm"
                    aria-label={t(
                      "portal.policies.wizard.routing.labelAria",
                      "Document types",
                    )}
                    placeholder={t(
                      "portal.policies.wizard.routing.labelPlaceholder",
                      "Choose document types",
                    )}
                    data={labelData}
                    value={rule.values}
                    onChange={(values) => update(index, { values })}
                    invalid={rule.values.length === 0}
                    searchable
                    clearable
                    maxDropdownHeight={280}
                    // The rule row lives inside the wizard modal.
                    comboboxProps={{ withinPortal: true }}
                  />
                  <Select
                    inputSize="sm"
                    aria-label={t(
                      "portal.policies.wizard.routing.destinationAria",
                      "Destination",
                    )}
                    placeholder={t(
                      "portal.policies.wizard.routing.chooseDestination",
                      "Choose a destination",
                    )}
                    value={rule.outputId || null}
                    invalid={rule.outputId === ""}
                    onChange={(value) =>
                      update(index, { outputId: value ?? "" })
                    }
                    options={destinations.map((dest) => ({
                      value: dest.id,
                      label: dest.name,
                    }))}
                    comboboxProps={{ withinPortal: true }}
                  />
                  <ActionIcon
                    variant="tertiary"
                    accent="danger"
                    size="sm"
                    aria-label={t(
                      "portal.policies.wizard.routing.remove",
                      "Remove rule",
                    )}
                    onClick={() => remove(index)}
                  >
                    <CloseRoundedIcon style={{ fontSize: "0.875rem" }} />
                  </ActionIcon>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {destinations.length === 0 ? (
        onCreateDestination ? (
          <Button
            variant="tertiary"
            size="sm"
            leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
            onClick={onCreateDestination}
          >
            {t("portal.policies.wizard.sources.connect", "Connect a source")}
          </Button>
        ) : (
          <Banner
            tone="info"
            description={t(
              "portal.policies.wizard.routing.needsDestination",
              "Add a destination below first - a rule needs somewhere to send documents to.",
            )}
          />
        )
      ) : (
        <Button
          variant="tertiary"
          size="sm"
          leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
          onClick={add}
        >
          {t("portal.policies.wizard.routing.addRule", "Add a rule")}
        </Button>
      )}
    </>
  );
}
