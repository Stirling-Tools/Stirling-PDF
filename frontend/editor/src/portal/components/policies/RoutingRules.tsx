import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  ActionIcon,
  Banner,
  Button,
  MultiSelect,
  Select,
  ToggleSwitch,
} from "@app/ui";
import { LABEL_FAMILIES } from "@app/data/classificationLabels";
import type { WireRoutingRule } from "@app/policies/types";
import "@portal/components/policies/RoutingRules.css";

/**
 * Opt-in editor for per-document delivery: which document types go where, tried in order, first
 * match wins. Off by default, and off is the whole of the plain case - one destination, every
 * document to it - so a pipeline that never meets classification never sees this.
 *
 * A rule takes SEVERAL classifications, because "invoices, receipts and credit notes all go to
 * Finance" is one decision, not three rules that happen to share a destination.
 *
 * Routing reads a verdict rather than producing one, so it stays switched off until the pipeline
 * has a classify step. The step is the user's to place: leaving it an ordinary step is what lets
 * classification sit mid-chain, or gate later steps, instead of being welded to this control.
 *
 * Turning it on seeds one blank rule rather than an empty list: an empty list IS off, so there
 * would be nothing to distinguish the two states, and a blank rule is the prompt to fill it in.
 */

/** The classification field a rule matches on; the only fact the UI offers today. */
const CLASSIFICATION_LABELS_FIELD = "classification.labels";

function blankRule(destinationId: string): WireRoutingRule {
  return {
    field: CLASSIFICATION_LABELS_FIELD,
    operator: "matches-any",
    // Starts empty so the invalid state prompts the user, as the destination does.
    values: [],
    outputId: destinationId,
  };
}

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
  /** Whether the pipeline classifies, i.e. whether there is a verdict for a rule to read. */
  canClassify: boolean;
}

export function RoutingRules({
  rules,
  onChange,
  destinations,
  onCreateDestination,
  canClassify,
}: RoutingRulesProps) {
  const { t } = useTranslation();
  const enabled = rules.length > 0;

  function update(index: number, patch: Partial<WireRoutingRule>) {
    onChange(
      rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );
  }

  function add() {
    onChange([...rules, blankRule(destinations[0]?.id ?? "")]);
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
      <div className="portal-routing__optin">
        <ToggleSwitch
          size="sm"
          checked={enabled}
          // Always switchable off, so a pipeline whose classify step was removed can be put
          // right from here rather than only by putting the step back.
          disabled={!canClassify && !enabled}
          onChange={(next) =>
            onChange(next ? [blankRule(destinations[0]?.id ?? "")] : [])
          }
          label={t(
            "portal.pipelines.builder.routing.toggle",
            "Send document types to different places",
          )}
          description={
            !canClassify
              ? t(
                  "portal.pipelines.builder.routing.needsClassify",
                  "Add a Classify step to the pipeline first - routes read the document type it works out.",
                )
              : enabled
                ? t(
                    "portal.pipelines.builder.routing.toggleOn",
                    "Documents are routed by the type the Classify step works out.",
                  )
                : t(
                    "portal.pipelines.builder.routing.toggleOff",
                    "Every document goes to the destination below.",
                  )
          }
          data-testid="routing-toggle"
        />
      </div>

      {enabled && (
        <>
          <h3 className="portal-routing__heading">
            {t("portal.pipelines.builder.routing.heading", "Routes")}
          </h3>
          {destinations.length === 0 ? (
            onCreateDestination ? (
              <Button
                variant="tertiary"
                size="sm"
                leftSection={
                  <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
                onClick={onCreateDestination}
              >
                {t(
                  "portal.policies.wizard.sources.connect",
                  "Connect a source",
                )}
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
            <>
              <div className="portal-routing__rules">
                {rules.map((rule, index) => (
                  <div key={index} className="portal-routing__rule">
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
                      comboboxProps={{ withinPortal: true }}
                    />
                    <div className="portal-routing__row">
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
              <Button
                variant="tertiary"
                size="sm"
                leftSection={
                  <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
                }
                onClick={add}
              >
                {t("portal.pipelines.builder.routing.addRule", "Add a route")}
              </Button>
            </>
          )}
        </>
      )}
    </>
  );
}
