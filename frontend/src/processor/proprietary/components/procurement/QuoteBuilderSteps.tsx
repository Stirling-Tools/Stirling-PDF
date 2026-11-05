import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import type { QuoteConfigInput, RateCard } from "@processor/api/procurement";
import { money } from "@processor/components/procurement/format";
import {
  Field,
  FieldError,
  isFilled,
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

/** Step 1: how much the buyer will process, which sets the usage fee. */
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
      <Field label={t("portal.procurement.builder.posture")}>
        <div className="portal-qb__opts">
          {POSTURES.map((p) => (
            <OptCard
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
      </Field>

      <Field label={t("portal.procurement.builder.pdfSize")}>
        <div className="portal-qb__opts">
          {SIZE_TIERS.map((s) => (
            <OptCard
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
      </Field>
    </Step>
  );
}

/** Step 2: term, service level and add-ons. */
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
      <Field label={t("portal.procurement.builder.term")}>
        <div className="portal-qb__pills">
          {[1, 2, 3, 4, 5].map((y) => (
            <button
              key={y}
              type="button"
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
      </Field>

      <Field label={t("portal.procurement.builder.serviceLevel")}>
        <div className="portal-qb__opts">
          <OptCard
            on={cfg.serviceLevel === "standard"}
            title={t("portal.procurement.builder.slStandard")}
            sub={t("portal.procurement.builder.slStandardSub")}
            onClick={() => set("serviceLevel", "standard")}
          />
          <OptCard
            on={cfg.serviceLevel === "priority"}
            title={t("portal.procurement.builder.slPriority")}
            sub={t("portal.procurement.builder.slPrioritySub")}
            onClick={() => set("serviceLevel", "priority")}
          />
          <OptCard
            on={cfg.serviceLevel === "dedicated"}
            title={t("portal.procurement.builder.slDedicated")}
            sub={t("portal.procurement.builder.slDedicatedSub")}
            onClick={() => set("serviceLevel", "dedicated")}
          />
        </div>
      </Field>

      <Field label={t("portal.procurement.builder.addons")}>
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
      </Field>
    </Step>
  );
}

/** Step 3: the buying entity's details, which the order form and invoice need. */
export function DetailsStep({
  cfg,
  set,
  valid,
  showErrors,
  emailTouched,
  onEmailBlur,
  eulaAlreadyAgreed,
  eula,
  setEula,
  onViewEula,
  canGenerate,
}: {
  cfg: QuoteConfigInput;
  set: SetQuoteField;
  valid: QuoteDetailsValidity;
  /** The buyer has tried to generate, so every invalid field says why. */
  showErrors: boolean;
  emailTouched: boolean;
  onEmailBlur: () => void;
  eulaAlreadyAgreed: boolean;
  eula: boolean;
  setEula: (agreed: boolean) => void;
  onViewEula: () => void;
  canGenerate: boolean;
}) {
  const { t } = useTranslation();
  const required = t("portal.procurement.validation.required");
  const eulaOk = eulaAlreadyAgreed || eula;
  return (
    <Step
      icon={<Icon name="users" size={22} />}
      title={t("portal.procurement.builder.s3Title")}
      sub={t("portal.procurement.builder.s3Sub")}
    >
      <div className="portal-qb__row">
        <Field
          label={t("portal.procurement.builder.businessName")}
          required
          invalid={showErrors && !valid.businessName}
          error={required}
        >
          <input
            placeholder={t(
              "portal.procurement.builder.businessNamePlaceholder",
            )}
            value={cfg.businessName}
            onChange={(e) => set("businessName", e.target.value)}
          />
        </Field>
        <Field
          label={t("portal.procurement.builder.contactName")}
          required
          invalid={showErrors && !valid.contactName}
          error={required}
        >
          <input
            placeholder={t("portal.procurement.builder.contactNamePlaceholder")}
            value={cfg.contactName ?? ""}
            onChange={(e) => set("contactName", e.target.value)}
          />
        </Field>
      </div>
      <Field
        label={t("portal.procurement.builder.contactEmail")}
        required
        invalid={
          (showErrors || (emailTouched && !!cfg.contactEmail?.trim())) &&
          !valid.contactEmail
        }
        error={
          isFilled(cfg.contactEmail)
            ? t("portal.procurement.validation.email")
            : required
        }
      >
        <input
          type="email"
          placeholder={t("portal.procurement.builder.contactEmailPlaceholder")}
          value={cfg.contactEmail ?? ""}
          onChange={(e) => set("contactEmail", e.target.value)}
          onBlur={onEmailBlur}
        />
      </Field>
      <Field
        label={t("portal.procurement.builder.addressLine1")}
        required
        invalid={showErrors && !valid.addressLine1}
        error={required}
      >
        <input
          placeholder={t("portal.procurement.builder.addressLine1Placeholder")}
          value={cfg.addressLine1 ?? ""}
          onChange={(e) => set("addressLine1", e.target.value)}
        />
      </Field>
      <Field label={t("portal.procurement.builder.addressLine2")}>
        <input
          placeholder={t("portal.procurement.builder.addressLine2Placeholder")}
          value={cfg.addressLine2 ?? ""}
          onChange={(e) => set("addressLine2", e.target.value)}
        />
      </Field>
      <div className="portal-qb__row">
        <Field
          label={t("portal.procurement.builder.city")}
          required
          invalid={showErrors && !valid.city}
          error={required}
        >
          <input
            placeholder={t("portal.procurement.builder.cityPlaceholder")}
            value={cfg.city ?? ""}
            onChange={(e) => set("city", e.target.value)}
          />
        </Field>
        <Field
          label={t("portal.procurement.builder.region")}
          required
          invalid={showErrors && !valid.region}
          error={required}
        >
          <input
            placeholder={t("portal.procurement.builder.regionPlaceholder")}
            value={cfg.region ?? ""}
            onChange={(e) => set("region", e.target.value)}
          />
        </Field>
        <Field
          label={t("portal.procurement.builder.postalCode")}
          required
          invalid={showErrors && !valid.postalCode}
          error={required}
        >
          <input
            placeholder={t("portal.procurement.builder.postalCodePlaceholder")}
            value={cfg.postalCode ?? ""}
            onChange={(e) => set("postalCode", e.target.value)}
          />
        </Field>
      </div>
      <div className="portal-qb__row">
        <Field label={t("portal.procurement.builder.poNumber")}>
          <input
            placeholder={t("portal.procurement.builder.poNumberPlaceholder")}
            value={cfg.poNumber ?? ""}
            onChange={(e) => set("poNumber", e.target.value)}
          />
        </Field>
        <Field label={t("portal.procurement.builder.taxId")}>
          <input
            placeholder={t("portal.procurement.builder.taxIdPlaceholder")}
            value={cfg.taxId ?? ""}
            onChange={(e) => set("taxId", e.target.value)}
          />
        </Field>
      </div>
      {!eulaAlreadyAgreed && (
        <label
          className="portal-qb__eula"
          data-invalid={(showErrors && !eulaOk) || undefined}
        >
          <input
            type="checkbox"
            checked={eula}
            aria-invalid={(showErrors && !eulaOk) || undefined}
            onChange={(e) => setEula(e.target.checked)}
          />
          <span>
            {t("portal.procurement.builder.eula")}{" "}
            <button
              type="button"
              className="portal-legal__link"
              onClick={onViewEula}
            >
              {t("portal.procurement.builder.viewEula")}
            </button>
          </span>
        </label>
      )}
      {!eulaAlreadyAgreed && showErrors && !eulaOk && (
        <FieldError>{t("portal.procurement.validation.eula")}</FieldError>
      )}
      {showErrors && !canGenerate && (
        <p className="portal-qb__error">
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

function OptCard({
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
      className="portal-qb__opt"
      data-on={on || undefined}
      onClick={onClick}
    >
      <span className="portal-qb__opt-title">{title}</span>
      <span className="portal-qb__opt-sub">{sub}</span>
    </button>
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
