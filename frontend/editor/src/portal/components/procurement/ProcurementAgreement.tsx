import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import type { QuoteResult } from "@portal/api/procurement";
import { money } from "@portal/components/procurement/format";
import "@portal/views/Procurement.css";

/**
 * The agreement (security) step: a single combined Stirling Enterprise Agreement — Master Service
 * Agreement + Order Form (from the issued quote) + EULA + Data Processing Agreement — that the buyer
 * reviews and agrees to before it's accepted into a subscription. No e-signature for now: an explicit
 * "I agree" click stands in (the terms reference the accepted quote). Document body is static legal
 * copy; the surrounding UI is translated.
 */
export function ProcurementAgreement({
  quote,
  busy,
  onAgree,
}: {
  quote: QuoteResult;
  busy: boolean;
  onAgree: () => void;
}) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  const annual = money(quote.annualNetMinor, quote.currency);
  const tcv = money(quote.tcvMinor, quote.currency);
  const years = quote.config.termYears;

  return (
    <Card padding="loose">
      <span className="portal-proc__eyebrow">
        {t("portal.procurement.agreement.eyebrow")}
      </span>
      <h3 className="portal-proc__builder-title">
        {t("portal.procurement.agreement.title")}
      </h3>
      <p className="portal-proc__subtitle">
        {t("portal.procurement.agreement.intro")}
      </p>

      <div className="portal-agreement__doc">
        <h4>1. Master Service Agreement</h4>
        <p>
          This Stirling Enterprise Agreement ("Agreement") is entered into
          between Stirling PDF Inc. ("Stirling") and the customer identified on
          the Order Form ("Customer"). It governs Customer's access to and use
          of the Stirling enterprise platform and related services (the
          "Service"). Stirling will provide the Service with commercially
          reasonable skill and care and in accordance with the service levels
          set out in the Order Form.
        </p>

        <h4>2. Order Form</h4>
        <p>
          Quote <strong>{quote.quoteNumber}</strong> forms the Order Form for
          this Agreement. Customer commits to a {years}-year term at{" "}
          <strong>{annual}</strong> per year (total contract value{" "}
          <strong>{tcv}</strong>), billed annually in advance by invoice. Fees
          are exclusive of taxes. The committed volume, service level, and
          add-ons are itemised below:
        </p>
        <ul className="portal-qb__lines portal-agreement__lines">
          {quote.lineItems.map((li) => (
            <li key={li.key} data-kind={li.kind}>
              <span>{li.label}</span>
              <span>
                {li.kind === "INCLUDED"
                  ? t("portal.procurement.builder.included")
                  : money(li.amountMinor, quote.currency)}
              </span>
            </li>
          ))}
        </ul>

        <h4>3. End-User License Agreement</h4>
        <p>
          Subject to the terms of this Agreement, Stirling grants Customer a
          non-exclusive, non-transferable right to use the Service for its
          internal business purposes during the term. Customer is responsible
          for its users' compliance and for the content it processes. The
          Service, and all intellectual property in it, remains Stirling's.
        </p>

        <h4>4. Data Processing Agreement</h4>
        <p>
          Where Stirling processes personal data on Customer's behalf, it does
          so only on Customer's documented instructions and applies appropriate
          technical and organisational measures. Sub-processors, international
          transfers, and security commitments are as described in Stirling's
          Data Processing Agreement and Trust Center, incorporated here by
          reference.
        </p>

        <h4>5. Acceptance</h4>
        <p>
          By agreeing below, Customer accepts this Agreement and the Order Form.
          On acceptance, Stirling will issue the committed annual subscription
          and its first invoice. This preview stands in for e-signature during
          the pilot.
        </p>
      </div>

      <label className="portal-qb__eula portal-agreement__accept">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>{t("portal.procurement.agreement.confirm")}</span>
      </label>

      <div className="portal-proc__payment-actions">
        <Button
          variant="primary"
          accent="premium"
          loading={busy}
          disabled={!checked}
          onClick={onAgree}
        >
          {t("portal.procurement.agreement.agreeCta")}
        </Button>
      </div>
    </Card>
  );
}
