import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {
  Banner,
  Button,
  Chip,
  NumberInput,
  Skeleton,
  ToggleSwitch,
} from "@app/ui";
import { SettingsRow } from "@app/ui/SettingsRow";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useAiEngineEnabled } from "@app/hooks/useAiEngineEnabled";
import { errorMessage } from "@portal/api/http";
import { saveReviewConfig, type ReviewConfig } from "@portal/api/review";
import { useReviewConfig } from "@portal/queries/review";
import { qk } from "@portal/queries/keys";
import {
  LABEL_FAMILIES,
  type LabelFamily,
} from "@app/data/classificationLabels";
import "@portal/components/review/ReviewBucketConfigForm.css";

const DEFAULT_THRESHOLD_PCT = 80;

/**
 * Edits the team-wide review-bucket configuration: which conditions hold a
 * source-processed file for a person to approve before delivery.
 *
 * The primary choice is coarse on purpose — whole document categories
 * (Financial, Medical, …) — because that is the decision an admin actually
 * makes. Individual document types live one level down behind a per-category
 * expander, and the rule toggles (failed runs, no label, low confidence) sit
 * behind "Advanced" since their defaults are right for almost everyone. On the
 * wire this is still a flat `watchedLabelIds` list, so nothing changes
 * server-side.
 */
export function ReviewBucketConfigForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const configAsync = useReviewConfig();
  // Labels and classifier confidence only exist because a classify step ran, and
  // that step is AI-engine-backed. With the engine off there is nothing for those
  // rules to read, so offering them would be a setting that silently does nothing.
  const labelRulesAvailable = useAiEngineEnabled();

  const [enabled, setEnabled] = useState(false);
  const [watched, setWatched] = useState<ReadonlySet<string>>(new Set());
  const [holdFailedRuns, setHoldFailedRuns] = useState(true);
  const [holdUnlabeled, setHoldUnlabeled] = useState(false);
  const [holdLowConfidence, setHoldLowConfidence] = useState(true);
  const [thresholdPct, setThresholdPct] = useState<number>(
    DEFAULT_THRESHOLD_PCT,
  );
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form from the stored config once it loads; later refetches don't
  // clobber in-progress edits (dirty guards it).
  const stored = configAsync.data;
  useEffect(() => {
    if (!stored || dirty) return;
    setEnabled(stored.enabled);
    setWatched(new Set(stored.watchedLabelIds));
    setHoldFailedRuns(stored.holdFailedRuns);
    setHoldUnlabeled(stored.holdUnlabeled);
    setHoldLowConfidence(stored.holdLowConfidence);
    setThresholdPct(Math.round(stored.confidenceThreshold * 100));
    // Surface Advanced pre-opened when the stored config deviates from the
    // defaults it hides — otherwise active rules would be invisible. Same when
    // the label rules are unavailable: failed runs is then the only rule there
    // is, and leaving it collapsed would make the tab look like it does nothing.
    if (
      !labelRulesAvailable ||
      !stored.holdFailedRuns ||
      stored.holdUnlabeled ||
      !stored.holdLowConfidence
    ) {
      setAdvancedOpen(true);
    }
  }, [stored, dirty, labelRulesAvailable]);

  const labelName = (id: string, fallback: string) =>
    t(`classification.labels.${id}`, fallback);

  // Family names are shown untranslated, matching ClassificationLabelsSection.
  const familyName = (family: LabelFamily) => family.name;

  const selectedInFamily = useMemo(() => {
    const counts = new Map<string, number>();
    for (const family of LABEL_FAMILIES) {
      counts.set(
        family.id,
        family.labels.filter((l) => watched.has(l.id)).length,
      );
    }
    return counts;
  }, [watched]);

  const watchedTotal = watched.size;

  function touch() {
    setDirty(true);
    setSaved(false);
  }

  function setFamily(family: LabelFamily, on: boolean) {
    touch();
    setWatched((prev) => {
      const next = new Set(prev);
      for (const label of family.labels) {
        if (on) next.add(label.id);
        else next.delete(label.id);
      }
      return next;
    });
  }

  function toggleLabel(id: string) {
    touch();
    setWatched((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    // With the engine off those rules aren't on screen, so they are written back
    // exactly as stored: saving "hold failed runs" must never quietly clear the
    // types a team picked while the engine was on.
    const config: ReviewConfig = {
      enabled,
      holdFailedRuns,
      watchedLabelIds: labelRulesAvailable
        ? [...watched]
        : (stored?.watchedLabelIds ?? []),
      holdUnlabeled: labelRulesAvailable
        ? holdUnlabeled
        : (stored?.holdUnlabeled ?? false),
      holdLowConfidence: labelRulesAvailable
        ? holdLowConfidence
        : (stored?.holdLowConfidence ?? true),
      confidenceThreshold: labelRulesAvailable
        ? Math.min(99, Math.max(1, thresholdPct || DEFAULT_THRESHOLD_PCT)) / 100
        : (stored?.confidenceThreshold ?? DEFAULT_THRESHOLD_PCT / 100),
    };
    try {
      await saveReviewConfig(config);
      await queryClient.invalidateQueries({ queryKey: qk.reviewConfig() });
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (configAsync.loading && !stored) {
    return (
      <div className="review-config" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height="2.5rem" />
        ))}
      </div>
    );
  }

  return (
    <div className="review-config">
      <SettingsRow
        label={t("portal.review.config.enabled.label", "Hold files for review")}
        description={t(
          "portal.review.config.enabled.description",
          "Files from your sources (S3, folders, webhooks) that match a condition below wait here for approval instead of being delivered. Files people work on in the editor are never held.",
        )}
        control={
          <ToggleSwitch
            size="sm"
            checked={enabled}
            onChange={(checked) => {
              touch();
              setEnabled(checked);
            }}
            label=""
          />
        }
      />

      <div
        className={
          enabled
            ? "review-config__body"
            : "review-config__body review-config__body--off"
        }
      >
        {!labelRulesAvailable && (
          <Banner
            tone="info"
            description={t(
              "portal.review.config.aiOff",
              "Document types and confidence need the AI engine, which is switched off here, so those conditions are hidden. Failed runs can still be held. Any types this team picked earlier are kept and start working again if the engine is turned back on.",
            )}
          />
        )}

        {labelRulesAvailable && (
          <>
            <div className="review-config__section-head">
              <h4 className="review-config__heading">
                {t(
                  "portal.review.config.categories.heading",
                  "Watched categories",
                )}
              </h4>
              <span className="review-config__tally">
                {watchedTotal === 0
                  ? t(
                      "portal.review.config.categories.none",
                      "Nothing watched yet",
                    )
                  : t("portal.review.config.categories.tally", {
                      count: watchedTotal,
                      defaultValue_one: "{{count}} document type watched",
                      defaultValue_other: "{{count}} document types watched",
                    })}
              </span>
            </div>
            <p className="review-config__hint">
              {t(
                "portal.review.config.categories.hint",
                "Hold every document classified into a category, or expand one to watch specific types.",
              )}
            </p>

            <div className="review-config__families" role="list">
              {LABEL_FAMILIES.map((family) => {
                const selected = selectedInFamily.get(family.id) ?? 0;
                const total = family.labels.length;
                const expanded = expandedFamily === family.id;
                return (
                  <div
                    key={family.id}
                    role="listitem"
                    className={
                      "review-config__family" +
                      (selected > 0 ? " review-config__family--active" : "")
                    }
                  >
                    <div className="review-config__family-row">
                      <Button
                        variant="quiet"
                        fullWidth
                        justify="between"
                        className="review-config__family-main"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedFamily(expanded ? null : family.id)
                        }
                        leftSection={
                          <span className="review-config__family-lead">
                            <ExpandMoreRoundedIcon
                              className={
                                "review-config__chevron" +
                                (expanded
                                  ? " review-config__chevron--open"
                                  : "")
                              }
                            />
                            <LocalIcon
                              icon={family.icon}
                              width="1.1rem"
                              className="review-config__family-icon"
                            />
                            <span className="review-config__family-name">
                              {familyName(family)}
                            </span>
                          </span>
                        }
                        rightSection={
                          <span className="review-config__family-count">
                            {selected === 0
                              ? t("portal.review.config.family.off", "Off")
                              : selected === total
                                ? t(
                                    "portal.review.config.family.all",
                                    "All types",
                                  )
                                : t("portal.review.config.family.some", {
                                    selected,
                                    total,
                                    defaultValue: "{{selected}} of {{total}}",
                                  })}
                          </span>
                        }
                      />
                      <ToggleSwitch
                        size="sm"
                        checked={selected > 0}
                        onChange={(checked) => setFamily(family, checked)}
                        ariaLabel={t("portal.review.config.family.aria", {
                          category: familyName(family),
                          defaultValue: "Hold all {{category}} documents",
                        })}
                      />
                    </div>
                    {expanded && (
                      <div className="review-config__labels">
                        {family.labels.map((label) => {
                          const on = watched.has(label.id);
                          return (
                            <Chip
                              key={label.id}
                              size="sm"
                              accent={on ? "brand" : "neutral"}
                              variant={on ? "primary" : "secondary"}
                              onClick={() => toggleLabel(label.id)}
                              aria-pressed={on}
                            >
                              {labelName(label.id, label.name)}
                            </Chip>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <Button
          variant="quiet"
          size="sm"
          className="review-config__advanced-toggle"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
          leftSection={
            <ExpandMoreRoundedIcon
              className={
                "review-config__chevron" +
                (advancedOpen ? " review-config__chevron--open" : "")
              }
            />
          }
        >
          {t("portal.review.config.advanced.heading", "Advanced conditions")}
        </Button>

        {advancedOpen && (
          <div className="review-config__advanced">
            <SettingsRow
              label={t(
                "portal.review.config.holdFailedRuns.label",
                "Hold failed runs",
              )}
              description={t(
                "portal.review.config.holdFailedRuns.description",
                "When a run fails, keep its files here rather than dropping them.",
              )}
              control={
                <ToggleSwitch
                  size="sm"
                  checked={holdFailedRuns}
                  onChange={(checked) => {
                    touch();
                    setHoldFailedRuns(checked);
                  }}
                  label=""
                />
              }
            />
            {labelRulesAvailable && (
              <>
                <SettingsRow
                  label={t(
                    "portal.review.config.holdLowConfidence.label",
                    "Hold low-confidence results",
                  )}
                  description={t(
                    "portal.review.config.holdLowConfidence.description",
                    "Hold a document when a step reports it was unsure. Covers the classifier and any other tool that scores its own output.",
                  )}
                  control={
                    <ToggleSwitch
                      size="sm"
                      checked={holdLowConfidence}
                      onChange={(checked) => {
                        touch();
                        setHoldLowConfidence(checked);
                      }}
                      label=""
                    />
                  }
                />
                {holdLowConfidence && (
                  <div className="review-config__threshold">
                    <span className="review-config__threshold-label">
                      {t(
                        "portal.review.config.threshold.label",
                        "Confidence threshold",
                      )}
                    </span>
                    <NumberInput
                      inputSize="sm"
                      value={thresholdPct}
                      onChange={(value) => {
                        touch();
                        setThresholdPct(typeof value === "number" ? value : 0);
                      }}
                      min={1}
                      max={99}
                      step={5}
                      suffix="%"
                      aria-label={t(
                        "portal.review.config.threshold.label",
                        "Confidence threshold",
                      )}
                    />
                  </div>
                )}
                <SettingsRow
                  label={t(
                    "portal.review.config.holdUnlabeled.label",
                    "Hold documents that get no label",
                  )}
                  description={t(
                    "portal.review.config.holdUnlabeled.description",
                    "Hold documents the classifier could not match to any type.",
                  )}
                  control={
                    <ToggleSwitch
                      size="sm"
                      checked={holdUnlabeled}
                      onChange={(checked) => {
                        touch();
                        setHoldUnlabeled(checked);
                      }}
                      label=""
                    />
                  }
                />
              </>
            )}
          </div>
        )}
      </div>

      {error && <Banner tone="danger" description={error} />}

      <div className="review-config__actions">
        {labelRulesAvailable && (
          <p className="review-config__disclaimer">
            <InfoOutlinedIcon className="review-config__disclaimer-icon" />
            {t(
              "portal.review.config.disclaimer",
              "Classification can be wrong. Check documents before sharing them.",
            )}
          </p>
        )}
        {saved && !dirty && (
          <span className="review-config__saved">
            {t("portal.review.config.saved", "Saved")}
          </span>
        )}
        <Button size="sm" loading={saving} disabled={!dirty} onClick={save}>
          {t("portal.review.config.save", "Save review settings")}
        </Button>
      </div>
    </div>
  );
}
