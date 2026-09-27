import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import {
  ActionIcon,
  Banner,
  Button,
  Card,
  Select,
  ToggleSwitch,
} from "@app/ui";
import { RoutingConditionEditor } from "@app/components/conditions/RoutingConditionEditor";
import {
  classificationCondition,
  documentFieldCondition,
  requiresClassification,
} from "@app/data/classificationConditions";
import type { WireRoutingRule } from "@app/policies/types";
import "@app/components/policies/RoutingRules.css";

export function blankRoutingRule(
  destinationId = "",
  classificationAvailable = true,
): WireRoutingRule {
  return {
    condition: classificationAvailable
      ? classificationCondition()
      : documentFieldCondition("document.extension"),
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
  /** Classification requires both an available AI service and, in the full builder, its step. */
  classificationAvailable?: boolean;
  classificationUnavailableReason?: string;
}

/**
 * The routes themselves: which document types go where, tried in order, first match wins. A rule
 * takes SEVERAL classifications, because "invoices, receipts and credit notes all go to Finance"
 * is one decision, not three rules that happen to share a destination.
 */
export function RoutingRules({
  rules,
  onChange,
  destinations,
  onCreateDestination,
  classificationAvailable = true,
  classificationUnavailableReason,
}: RoutingRulesProps) {
  const { t } = useTranslation();

  function update(index: number, patch: Partial<WireRoutingRule>) {
    onChange(
      rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );
  }

  if (destinations.length === 0) {
    return onCreateDestination ? (
      <Button
        variant="tertiary"
        size="sm"
        leftSection={<Icon name="plus" size={"1.125rem"} />}
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
    );
  }

  return (
    <>
      {rules.some((rule) => requiresClassification(rule.condition)) &&
        !classificationAvailable && (
          <Banner
            tone="warning"
            description={
              classificationUnavailableReason ??
              t(
                "portal.pipelines.builder.routing.aiUnavailable",
                "Document-type routing is disabled because AI classification is unavailable. Route on a document property instead.",
              )
            }
          />
        )}
      <Card padding="none">
        <div className="portal-routing__rules">
          {rules.map((rule, index) => (
            <div key={index} className="portal-routing__rule">
              <div className="portal-routing__row">
                <RoutingConditionEditor
                  condition={rule.condition}
                  onChange={(condition) => update(index, { condition })}
                  classificationAvailable={classificationAvailable}
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
                  onChange={(value) => update(index, { outputId: value ?? "" })}
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
                  onClick={() => onChange(rules.filter((_, i) => i !== index))}
                >
                  <Icon name="x" size={"0.875rem"} />
                </ActionIcon>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Button
        variant="tertiary"
        size="sm"
        leftSection={<Icon name="plus" size={"1.125rem"} />}
        onClick={() =>
          onChange([
            ...rules,
            blankRoutingRule(
              destinations[0]?.id ?? "",
              classificationAvailable,
            ),
          ])
        }
      >
        {t("portal.pipelines.builder.routing.addRule", "Add a route")}
      </Button>
    </>
  );
}

interface RoutingSectionProps extends RoutingRulesProps {
  /** Whether the pipeline classifies, i.e. whether there is a verdict for a rule to read. */
  canClassify: boolean;
  aiClassificationEnabled?: boolean;
}

/** Document-property routes work without AI; document-type routes require an available classification step. */
export function RoutingSection({
  canClassify,
  aiClassificationEnabled = true,
  ...rules
}: RoutingSectionProps) {
  const { t } = useTranslation();
  const enabled = rules.rules.length > 0;
  const classificationAvailable = canClassify && aiClassificationEnabled;
  const unavailableReason = !aiClassificationEnabled
    ? t(
        "portal.pipelines.builder.routing.aiDisabled",
        "AI classification is not enabled. Enable it in Settings, or route on a document property instead.",
      )
    : !canClassify
      ? t(
          "portal.pipelines.builder.routing.needsClassify",
          "Add a Classify step to use document-type routing, or match on a document property instead.",
        )
      : undefined;

  return (
    <>
      <div className="portal-routing__optin">
        <ToggleSwitch
          size="sm"
          checked={enabled}
          onChange={(next) =>
            rules.onChange(
              next
                ? [
                    blankRoutingRule(
                      rules.destinations[0]?.id ?? "",
                      classificationAvailable,
                    ),
                  ]
                : [],
            )
          }
          label={t(
            "portal.pipelines.builder.routing.toggle",
            "Send document types to different places",
          )}
          description={
            enabled
              ? t(
                  "portal.pipelines.builder.routing.toggleOn",
                  "Documents are routed by the first document condition they match.",
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
          <RoutingRules
            {...rules}
            classificationAvailable={classificationAvailable}
            classificationUnavailableReason={unavailableReason}
          />
        </>
      )}
    </>
  );
}
