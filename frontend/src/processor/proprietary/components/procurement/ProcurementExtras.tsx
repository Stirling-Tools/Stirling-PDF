import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@editor/ui";
import {
  DEPLOYMENTS,
  fetchLegalDocument,
  type Deployment,
  type TrialSetupDetails,
} from "@processor/api/procurement";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";
import { CalendlyInline } from "@processor/components/procurement/CalendlyInline";
import { DeploymentDetails } from "@processor/components/procurement/DeploymentDetails";
import { FlowModal } from "@processor/components/shared/FlowModal";
import { useAsync } from "@processor/hooks/useAsync";
import type { TrialDraft } from "@processor/components/procurement/trialDraft";
import { useProcurementPrefill } from "@processor/components/procurement/prefill";
import { openApiUrl } from "@processor/api/externalUrl";
import "@processor/views/Procurement.css";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import {
  ConsentCheckbox,
  emailFieldError,
  Field,
  FieldGroup,
  focusFirstInvalid,
  isEmail,
  isFilled,
  OptionCard,
} from "@processor/components/procurement/formField";

/**
 * Pieces of the Enterprise page that stand apart from the journey's stages: the trial setup form,
 * the deal's documents, booking a call, and the legal-document reader.
 */

function SideModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  headerAside,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Sits on the title row, before the close button (e.g. a "Step 1 of 2" badge). */
  headerAside?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <FlowModal
      open={open}
      onClose={onClose}
      label={title}
      size={wide ? "lg" : "md"}
      footer={footer}
      header={
        <>
          <div className="portal-sidemodal__title-row">
            <h2 className="portal-sidemodal__title">{title}</h2>
            {headerAside}
          </div>
          {subtitle && <p className="portal-sidemodal__sub">{subtitle}</p>}
        </>
      }
    >
      {children}
    </FlowModal>
  );
}

/**
 * Reader for a versioned legal document (EULA, SLA exhibit, subprocessors), fetched from the
 * backend registry and rendered as markdown. Open when {@code docId} is set. Drafts are badged.
 */
export function LegalDocumentModal({
  docId,
  onClose,
}: {
  docId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, loading } = useAsync(
    () => (docId ? fetchLegalDocument(docId) : Promise.resolve(null)),
    [docId],
  );
  return (
    <SideModal
      open={docId !== null}
      onClose={onClose}
      wide
      title={data?.displayName ?? t("portal.legal.title")}
      subtitle={
        data
          ? data.status !== "final"
            ? t("portal.legal.draft", { label: data.versionLabel })
            : data.versionLabel
          : undefined
      }
    >
      {loading && (
        <p className="portal-sidemodal__text">{t("portal.legal.loading")}</p>
      )}
      {!loading && !data && (
        <p className="portal-sidemodal__text">{t("portal.legal.loadError")}</p>
      )}
      {data && (
        <div className="portal-agreement__md">
          <Markdown remarkPlugins={[remarkGfm]}>{data.markdown}</Markdown>
        </div>
      )}
    </SideModal>
  );
}

// ── Documents ────────────────────────────────────────────────────────────────
/**
 * The deal's paperwork in one place, reachable throughout the journey (not tied to the current
 * stage): the enterprise agreement, the quote, the invoice, and the reference documents (EULA, SLA
 * exhibit, subprocessors). Each row downloads or views the real artifact when it's available, and
 * reads as "available later" until then.
 */
export function DocumentsList({
  agreementVersion,
  downloadingAgreement,
  onDownloadAgreement,
  onViewAgreement,
  quoteAvailable,
  downloadingQuote,
  onDownloadQuote,
  invoiceUrl,
  invoicePdf,
}: {
  agreementVersion?: string | null;
  downloadingAgreement?: boolean;
  onDownloadAgreement: () => void;
  /** Open the agreement to read and sign; omitted where the viewer cannot act on it. */
  onViewAgreement?: () => void;
  quoteAvailable: boolean;
  downloadingQuote?: boolean;
  onDownloadQuote: () => void;
  invoiceUrl?: string | null;
  invoicePdf?: string | null;
}) {
  const { t } = useTranslation();
  const [legalDoc, setLegalDoc] = useState<string | null>(null);
  const invoice = invoiceUrl || invoicePdf || null;

  const docs: DocEntry[] = [
    {
      name: t("portal.procurement.documents.agreement"),
      sub: agreementVersion ?? t("portal.procurement.documents.agreementSub"),
      action: agreementVersion
        ? {
            label: t("portal.procurement.documents.download"),
            onClick: onDownloadAgreement,
            loading: downloadingAgreement,
          }
        : quoteAvailable && onViewAgreement
          ? {
              label: t("portal.procurement.documents.view"),
              onClick: onViewAgreement,
            }
          : {
              // With a quote issued, the agreement waits on accepting it, not on the quote.
              unavailable: quoteAvailable
                ? t("portal.procurement.documents.laterInvoice")
                : t("portal.procurement.documents.laterQuote"),
            },
    },
    {
      name: t("portal.procurement.documents.quote"),
      sub: t("portal.procurement.documents.quoteSub"),
      action: quoteAvailable
        ? {
            label: t("portal.procurement.documents.download"),
            onClick: onDownloadQuote,
            loading: downloadingQuote,
          }
        : { unavailable: t("portal.procurement.documents.laterQuote") },
    },
    {
      name: t("portal.procurement.documents.invoice"),
      sub: t("portal.procurement.documents.invoiceSub"),
      action: invoice
        ? {
            label: t("portal.procurement.documents.view"),
            onClick: () => openApiUrl(invoice),
          }
        : // Issued on signing, which comes after accepting the quote.
          { unavailable: t("portal.procurement.documents.laterSigning") },
    },
    {
      name: t("portal.procurement.documents.eula"),
      sub: t("portal.procurement.documents.eulaSub"),
      action: {
        label: t("portal.procurement.documents.view"),
        onClick: () => setLegalDoc("eula"),
      },
    },
    {
      name: t("portal.procurement.documents.sla"),
      sub: t("portal.procurement.documents.slaSub"),
      action: {
        label: t("portal.procurement.documents.view"),
        onClick: () => setLegalDoc("sla"),
      },
    },
    {
      name: t("portal.procurement.documents.subprocessors"),
      sub: t("portal.procurement.documents.subprocessorsSub"),
      action: {
        label: t("portal.procurement.documents.view"),
        onClick: () => setLegalDoc("subprocessors"),
      },
    },
  ];
  // What can be opened now leads; what the deal has yet to produce follows, quieter.
  const ready = docs.filter((d) => !("unavailable" in d.action));
  const later = docs.filter((d) => "unavailable" in d.action);

  return (
    <>
      <ul className="portal-docmodal">
        {ready.map((d) => (
          <DocItem key={d.name} {...d} />
        ))}
      </ul>
      {later.length > 0 && (
        <>
          <h3 className="portal-docmodal__group">
            {t("portal.procurement.documents.laterTitle", "Later in your deal")}
          </h3>
          <ul className="portal-docmodal portal-docmodal--later">
            {later.map((d) => (
              <DocItem key={d.name} {...d} />
            ))}
          </ul>
        </>
      )}
      <LegalDocumentModal docId={legalDoc} onClose={() => setLegalDoc(null)} />
    </>
  );
}

interface DocEntry {
  name: string;
  sub: string;
  action:
    | { label: string; onClick: () => void; loading?: boolean }
    | { unavailable: string };
}

/** One row in the Documents list: name + sub on the left, an action button or a muted note. */
function DocItem({ name, sub, action }: DocEntry) {
  return (
    <li className="portal-docmodal__row">
      <div className="portal-docmodal__text">
        <span className="portal-docmodal__name">{name}</span>
        <span className="portal-docmodal__sub">{sub}</span>
      </div>
      {"unavailable" in action ? (
        <span className="portal-docmodal__later">{action.unavailable}</span>
      ) : (
        <Button
          variant="secondary"
          loading={action.loading}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </li>
  );
}

// ── Schedule a call ──────────────────────────────────────────────────────────
export function ScheduleCallModal({
  open,
  onClose,
  email,
}: {
  open: boolean;
  onClose: () => void;
  /** Linked account's email; prefills the Calendly booking form. */
  email?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <SideModal
      open={open}
      onClose={onClose}
      title={t("portal.procurement.schedule.title")}
      subtitle={t("portal.procurement.schedule.subtitle")}
      wide
    >
      <CalendlyInline email={email} />
    </SideModal>
  );
}

// ── Trial setup ────────────────────────────────────────────────────────────

/**
 * Captured before the trial starts: where the buyer will run Stirling (which drives the deployment
 * fee and, for air-gapped, the offline licence) and their team size. Both seed the quote builder so
 * it opens on their real environment; the trial only begins once this is confirmed.
 */
export function TrialSetupForm({
  busy,
  email,
  initial,
  startLabel,
  onScheduleCall,
  onConfirm,
}: {
  busy: boolean;
  /** Answers given before a sign-in detour; the form reopens on its last step with them. */
  initial?: TrialDraft | null;
  /** Replaces "Start trial" where confirming leads somewhere else first, such as sign-in. */
  startLabel?: string;
  /** Linked-account email, prefilled as the work email on the details step. */
  email?: string | null;
  /** The step-1 escape hatch for buyers who want to talk first. */
  onScheduleCall: () => void;
  onConfirm: (
    deployment: string,
    seats: number,
    details: TrialSetupDetails,
  ) => void;
}) {
  const { t } = useTranslation();
  const prefill = useProcurementPrefill();
  const [step, setStep] = useState(initial ? 1 : 0);
  const [deployment, setDeployment] = useState<Deployment>(
    () => DEPLOYMENTS.find((d) => d === initial?.deployment) ?? "cloud",
  );
  const [seats, setSeats] = useState(
    initial ? String(initial.seats) : String(prefill?.seats ?? ""),
  );
  const [contactName, setContactName] = useState(
    initial?.details.contactName ?? prefill?.contactName ?? "",
  );
  const [businessName, setBusinessName] = useState(
    initial?.details.businessName ?? prefill?.businessName ?? "",
  );
  const [contactEmail, setContactEmail] = useState(
    initial?.details.contactEmail || email || prefill?.contactEmail || "",
  );
  const [inviteEmails, setInviteEmails] = useState(
    initial?.details.inviteEmails ?? "",
  );
  const [eula, setEula] = useState(false);
  const [legalDoc, setLegalDoc] = useState<string | null>(null);

  // The linked email can arrive after the form mounts; fill it in unless the buyer typed their own.
  useEffect(() => {
    if (email) setContactEmail((current) => current || email);
  }, [email]);

  // The buying entity is what the quote and agreement are drawn against, so it is required here
  // rather than deferred to the quote; invites are genuinely optional.
  const seatsValid = Number(seats) > 0;
  const valid = {
    contactName: isFilled(contactName),
    businessName: isFilled(businessName),
    contactEmail: isEmail(contactEmail),
  };
  const detailsValid = Object.values(valid).every(Boolean);
  // Errors wait for an attempt to move on, except a mistyped email, which shows on leaving the field.
  const [triedSeats, setTriedSeats] = useState(false);
  const [triedStart, setTriedStart] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const required = t("portal.procurement.validation.required");
  const emailError = emailFieldError(
    contactEmail,
    { tried: triedStart, touched: emailTouched },
    { required, invalid: t("portal.procurement.validation.email") },
  );

  const confirm = () => {
    onConfirm(deployment, Math.max(0, Number(seats) || 0), {
      businessName: businessName.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      inviteEmails: inviteEmails.trim(),
    });
  };

  const continueToDetails = () => {
    if (!seatsValid) {
      setTriedSeats(true);
      focusFirstInvalid();
      return;
    }
    setStep(1);
  };
  const start = () => {
    if (!detailsValid || !eula) {
      setTriedStart(true);
      focusFirstInvalid();
      return;
    }
    confirm();
  };

  return (
    <div className="portal-setup">
      <StepModalHeader
        title={t("portal.procurement.setup.title")}
        subtitle={t(
          step === 0
            ? "portal.procurement.setup.subtitle"
            : "portal.procurement.setup.subtitleDetails",
        )}
        step={step + 1}
        total={2}
        stepLabel={t("portal.procurement.setup.stepOf", {
          n: step + 1,
          total: 2,
        })}
      />

      {step === 0 && (
        <>
          <Field
            label={t("portal.procurement.setup.seats")}
            required
            invalid={triedSeats && !seatsValid}
            error={t("portal.procurement.validation.seats")}
          >
            <input
              type="number"
              min={0}
              required
              placeholder={t("portal.procurement.setup.seatsPlaceholder")}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </Field>
          <FieldGroup label={t("portal.procurement.setup.deployment")}>
            <div className="ent-deploy-wrap">
              <div className="ent-deploy-choice">
                <div className="portal-qb__opts">
                  {DEPLOYMENTS.map((d) => (
                    <OptionCard
                      key={d}
                      on={deployment === d}
                      title={t(`portal.procurement.setup.${d}`)}
                      sub={t(`portal.procurement.setup.${d}Sub`)}
                      onClick={() => setDeployment(d)}
                    />
                  ))}
                </div>
                <DeploymentDetails deployment={deployment} />
              </div>
            </div>
          </FieldGroup>
        </>
      )}

      {step === 1 && (
        <>
          <div className="portal-qb__row">
            <Field
              label={t("portal.procurement.setup.fullName")}
              required
              invalid={triedStart && !valid.contactName}
              error={required}
            >
              <input
                value={contactName}
                className={privateContentClassName}
                placeholder={t("portal.procurement.setup.fullNamePlaceholder")}
                onChange={(e) => setContactName(e.target.value)}
              />
            </Field>
            <Field
              label={t("portal.procurement.setup.businessName")}
              required
              invalid={triedStart && !valid.businessName}
              error={required}
            >
              <input
                value={businessName}
                className={privateContentClassName}
                placeholder={t(
                  "portal.procurement.setup.businessNamePlaceholder",
                )}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </Field>
          </div>
          <Field
            label={t("portal.procurement.setup.workEmail")}
            required
            invalid={emailError != null}
            error={emailError ?? undefined}
          >
            <input
              type="email"
              value={contactEmail}
              className={privateContentClassName}
              placeholder={t("portal.procurement.setup.workEmailPlaceholder")}
              onChange={(e) => setContactEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
            />
          </Field>
          <Field label={t("portal.procurement.setup.invites")}>
            <input
              value={inviteEmails}
              className={privateContentClassName}
              placeholder={t("portal.procurement.setup.invitesPlaceholder")}
              onChange={(e) => setInviteEmails(e.target.value)}
            />
          </Field>

          <ConsentCheckbox
            checked={eula}
            onChange={setEula}
            invalid={triedStart && !eula}
            error={t("portal.procurement.validation.eula")}
          >
            {t("portal.procurement.setup.eula")}{" "}
            <button
              type="button"
              className="portal-legal__link"
              onClick={() => setLegalDoc("eula")}
            >
              {t("portal.procurement.setup.viewEula")}
            </button>
          </ConsentCheckbox>
        </>
      )}

      <div className="portal-setup__foot">
        {step === 0 ? (
          <>
            <span className="portal-sidemodal__foot-hint">
              {t("portal.procurement.setup.talkFirst")}{" "}
              <button
                type="button"
                className="portal-legal__link"
                onClick={onScheduleCall}
              >
                {t("portal.procurement.setup.scheduleCall")}
              </button>
            </span>
            <Button variant="primary" onClick={continueToDetails}>
              {t("portal.procurement.setup.continue")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep(0)}>
              {t("portal.procurement.setup.back")}
            </Button>
            <Button variant="primary" loading={busy} onClick={start}>
              {startLabel ?? t("portal.procurement.setup.start")}
            </Button>
          </>
        )}
      </div>
      <LegalDocumentModal docId={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
}
