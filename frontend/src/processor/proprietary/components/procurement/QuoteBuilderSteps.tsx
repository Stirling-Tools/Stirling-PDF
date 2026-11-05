import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import type { QuoteConfigInput, RateCard } from "@processor/api/procurement";
import { money } from "@processor/components/procurement/format";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import {
  ConsentCheckbox,
  emailFieldError,
  Field,
  FieldGroup,
  OptionCard,
} from "@processor/components/procurement/formField";
import {
  estimateVolume,
  POSTURES,
  SIZE_TIERS,
  termDiscount,
} from "@processor/components/procurement/quotePricing";

/** Sets one field of the quote being built. */
export type SetQuoteField = <K extends keyof QuoteConfigInput>(
  k: K,
  v: QuoteConfigInput[K],
) => void;

/** Which of the buyer's required details are filled in validly. */
export type QuoteDetailsValidity = Record<
  | "businessName"
  | "contactName"
  | "contactEmail"
  | "addressLine1"
  | "city"
  | "region"
  | "postalCode",
  boolean
>;

/** How much the buyer will process, which sets the usage fee. */
export function SizingStep({
  cfg,
  set,
  manualVolume,
  setManualVolume,
  volumeInvalid,
}: {
  cfg: QuoteConfigInput;
  set: SetQuoteField;
  /** The volume was typed rather than estimated from the team size. */
  manualVolume: boolean;
  setManualVolume: (manual: boolean) => void;
  volumeInvalid: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Step
      icon={<Icon name="file-text" size={22} />}
      title={t("portal.procurement.builder.s1Title")}
      sub={t("portal.procurement.builder.s1Sub")}
    >
      <div className="portal-qb__row">
        <Field label={t("portal.procurement.builder.users")}>
          <input
            type="number"
            min={0}
            placeholder={t("portal.procurement.builder.usersPlaceholder")}
            value={cfg.users || ""}
            onChange={(e) => {
              const users = Number(e.target.value);
              set("users", users);
              // A manual figure gives way here, as the hint under the fields promises.
              setManualVolume(false);
              set("volume", estimateVolume(users));
            }}
          />
        </Field>
        <Field
          label={t("portal.procurement.builder.volume")}
          required
          invalid={volumeInvalid}
          error={t("portal.procurement.validation.volume")}
        >
          <input
            type="number"
            min={0}
            placeholder={t("portal.procurement.builder.volumePlaceholder")}
            value={cfg.volume || ""}
            onChange={(e) => {
              setManualVolume(true);
              set("volume", Number(e.target.value));
            }}
          />
        </Field>
      </div>
      <p className="portal-qb__hint">
        {cfg.users > 0 && !manualVolume
          ? t("portal.procurement.builder.volEstimated", {
              count: cfg.users,
            })
          : cfg.users > 0
            ? t("portal.procurement.builder.volManual")
            : t("portal.procurement.builder.volNoUsers")}
      </p>
      <FieldGroup label={t("portal.procurement.builder.posture")}>
        <div className="portal-qb__opts">
          {POSTURES.map((p) => (
            <OptionCard
              key={p.key}
              on={cfg.intensity === p.intensity}
              title={t(`portal.procurement.builder.posture_${p.key}`)}
              sub={`${t("portal.procurement.builder.posture_count", {
                count: p.intensity,
              })} · ${t(`portal.procurement.builder.posture_${p.key}Sub`)}`}
              onClick={() => set("intensity", p.intensity)}
            />
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label={t("portal.procurement.builder.pdfSize")}>
        <div className="portal-qb__opts">
          {SIZE_TIERS.map((s) => (
            <OptionCard
              key={s.key}
              on={cfg.sizeMult === s.mult}
              title={t(`portal.procurement.builder.size_${s.key}`)}
              // The multiplier stays in the price, not on the card: it is rate detail buyers
              // need not weigh, and the running estimate already shows its effect.
              sub={t(`portal.procurement.builder.size_${s.key}Sub`)}
              onClick={() => set("sizeMult", s.mult)}
            />
          ))}
        </div>
      </FieldGroup>
    </Step>
  );
}

/** Term, service level and add-ons. */
export function PlanStep({
  cfg,
  set,
  rates,
  indemnityPreview,
}: {
  cfg: QuoteConfigInput;
  set: SetQuoteField;
  rates: RateCard;
  /** What indemnification adds a year at the current usage, in cents. */
  indemnityPreview: number;
}) {
  const { t } = useTranslation();
  return (
    <Step
      icon={<Icon name="shield-check" size={22} />}
      title={t("portal.procurement.builder.s2Title")}
      sub={t("portal.procurement.builder.s2Sub")}
    >
      <FieldGroup label={t("portal.procurement.builder.term")}>
        <div className="portal-qb__pills">
          {rates.termDiscountByYear
            .map((_, i) => i + 1)
            .map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={cfg.termYears === y}
                data-on={cfg.termYears === y || undefined}
                onClick={() => set("termYears", y)}
              >
                {t("portal.procurement.builder.years", { count: y })}
              </button>
            ))}
        </div>
        {termDiscount(rates, cfg.termYears) > 0 && (
          <p className="portal-qb__discount">
            {t("portal.procurement.builder.termDiscount", {
              pct: Math.round(termDiscount(rates, cfg.termYears) * 100),
            })}
          </p>
        )}
      </FieldGroup>

      <FieldGroup label={t("portal.procurement.builder.serviceLevel")}>
        <div className="portal-qb__opts">
          <OptionCard
            on={cfg.serviceLevel === "standard"}
            title={t("portal.procurement.builder.slStandard")}
            sub={t("portal.procurement.builder.slStandardSub")}
            onClick={() => set("serviceLevel", "standard")}
          />
          <OptionCard
            on={cfg.serviceLevel === "priority"}
            title={t("portal.procurement.builder.slPriority")}
            sub={t("portal.procurement.builder.slPrioritySub")}
            onClick={() => set("serviceLevel", "priority")}
          />
          <OptionCard
            on={cfg.serviceLevel === "dedicated"}
            title={t("portal.procurement.builder.slDedicated")}
            sub={t("portal.procurement.builder.slDedicatedSub")}
            onClick={() => set("serviceLevel", "dedicated")}
          />
        </div>
      </FieldGroup>

      <FieldGroup label={t("portal.procurement.builder.addons")}>
        <div className="portal-qb__addons">
          <AddOn
            on={cfg.indemnification}
            title={t("portal.procurement.builder.indemnification")}
            sub={`${t("portal.procurement.builder.indemnificationSub")} · ${t(
              "portal.procurement.builder.addonPerYear",
              { amount: money(indemnityPreview) },
            )}`}
            onClick={() => set("indemnification", !cfg.indemnification)}
          />
          <AddOn
            on={cfg.training}
            title={t("portal.procurement.builder.training")}
            sub={`${t("portal.procurement.builder.trainingSub")} · ${t(
              "portal.procurement.builder.addonOneTime",
              { amount: money(rates.trainingOneTimeMinor) },
            )}`}
            onClick={() => set("training", !cfg.training)}
          />
          <AddOn
            on={cfg.qbr}
            title={t("portal.procurement.builder.qbr")}
            sub={`${t("portal.procurement.builder.qbrSub")} · ${t(
              "portal.procurement.builder.addonPerYear",
              { amount: money(rates.qbrAnnualMinor) },
            )}`}
            onClick={() => set("qbr", !cfg.qbr)}
          />
        </div>
      </FieldGroup>
    </Step>
  );
}

/** The buying entity's details, which the order form and invoice need. */
export function DetailsStep({
  cfg,
  set,
  valid,
  showErrors,
  emailTouched,
  onEmailBlur,
  eula,
}: {
  cfg: QuoteConfigInput;
  set: SetQuoteField;
  valid: QuoteDetailsValidity;
  /** The buyer has tried to generate, so every invalid field says why. */
  showErrors: boolean;
  emailTouched: boolean;
  onEmailBlur: () => void;
  /** The EULA clickwrap, or null when the buyer already accepted it. */
  eula: {
    checked: boolean;
    onChange: (agreed: boolean) => void;
    onView: () => void;
  } | null;
}) {
  const { t } = useTranslation();
  const required = t("portal.procurement.validation.required");
  /** One of the buyer's text details; its label and placeholder keys follow its name. */
  const text = (
    name:
      | Exclude<keyof QuoteDetailsValidity, "contactEmail">
      | "addressLine2"
      | "poNumber"
      | "taxId",
  ) => {
    const isRequired = name in valid;
    return (
      <Field
        label={t(`portal.procurement.builder.${name}`)}
        required={isRequired}
        invalid={
          isRequired && showErrors && !valid[name as keyof QuoteDetailsValidity]
        }
        error={required}
      >
        <input
          className={privateContentClassName}
          placeholder={t(`portal.procurement.builder.${name}Placeholder`)}
          value={cfg[name] ?? ""}
          onChange={(e) => set(name, e.target.value)}
        />
      </Field>
    );
  };
  const emailError = emailFieldError(
    cfg.contactEmail,
    { tried: showErrors, touched: emailTouched },
    { required, invalid: t("portal.procurement.validation.email") },
  );
  const eulaInvalid = eula != null && showErrors && !eula.checked;
  const incomplete =
    !Object.values(valid).every(Boolean) || (eula != null && !eula.checked);
  return (
    <Step
      icon={<Icon name="users" size={22} />}
      title={t("portal.procurement.builder.s3Title")}
      sub={t("portal.procurement.builder.s3Sub")}
    >
      <div className="portal-qb__row">
        {text("businessName")}
        {text("contactName")}
      </div>
      <Field
        label={t("portal.procurement.builder.contactEmail")}
        required
        invalid={emailError != null}
        error={emailError ?? undefined}
      >
        <input
          type="email"
          className={privateContentClassName}
          placeholder={t("portal.procurement.builder.contactEmailPlaceholder")}
          value={cfg.contactEmail ?? ""}
          onChange={(e) => set("contactEmail", e.target.value)}
          onBlur={onEmailBlur}
        />
      </Field>
      {text("addressLine1")}
      {text("addressLine2")}
      <div className="portal-qb__row">
        {text("city")}
        {text("region")}
        {text("postalCode")}
      </div>
      <div className="portal-qb__row">
        {text("poNumber")}
        {text("taxId")}
      </div>
      {eula && (
        <ConsentCheckbox
          checked={eula.checked}
          onChange={eula.onChange}
          invalid={eulaInvalid}
          error={t("portal.procurement.validation.eula")}
        >
          {t("portal.procurement.builder.eula")}{" "}
          <button
            type="button"
            className="portal-legal__link"
            onClick={eula.onView}
          >
            {t("portal.procurement.builder.viewEula")}
          </button>
        </ConsentCheckbox>
      )}
      {showErrors && incomplete && (
        <p className="portal-qb__error" role="alert">
          {t("portal.procurement.builder.completeRequired")}
        </p>
      )}
    </Step>
  );
}

function Step({
  icon,
  title,
  sub,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="portal-qb__intro">
        <span className="portal-qb__intro-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <div className="portal-qb__intro-title">{title}</div>
          <div className="portal-qb__intro-sub">{sub}</div>
        </div>
      </div>
      {children}
    </>
  );
}

function AddOn({
  on,
  title,
  sub,
  onClick,
}: {
  on: boolean;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="portal-qb__addon"
      aria-pressed={on}
      data-on={on || undefined}
      onClick={onClick}
    >
      <span className="portal-qb__addon-box" aria-hidden>
        {on ? "✓" : ""}
      </span>
      <span>
        <span className="portal-qb__addon-title">{title}</span>
        <span className="portal-qb__addon-sub">{sub}</span>
      </span>
    </button>
  );
}
