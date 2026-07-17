package stirling.software.saas.procurement.legal;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.legal.LegalDocumentMeta;
import stirling.software.saas.legal.LegalDocumentRegistry;
import stirling.software.saas.procurement.model.ProcurementQuote;
import stirling.software.saas.procurement.pricing.ProcurementPricingService;
import stirling.software.saas.procurement.pricing.QuoteConfig;
import stirling.software.saas.procurement.pricing.QuoteLineItem;

/**
 * Builds the full Stirling Enterprise Agreement for a specific quote: the static MSA (Part A) and
 * DPA (Part C) from the {@link LegalDocumentRegistry}, with the dynamic Order Form (Part B)
 * generated from the quote and slotted where the manifest's {@code @order-form} part sits.
 *
 * <p>Only the Order Form varies per deal; the MSA and DPA bodies are rendered verbatim with token
 * substitution. The set of values used is returned as {@code variablesJson} so a signature can pin
 * exactly what was rendered.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgreementAssembler {

    public static final String DOC_ID = "enterprise-agreement";

    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.US);
    private static final String BLANK = "\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_";

    private final LegalDocumentRegistry registry;
    private final ProcurementPricingService pricing;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Render the agreement for a quote. {@code signing} is null for a preview (before signing) —
     * the effective date and signature block then read as blanks / "On signature".
     */
    public AssembledAgreement assemble(ProcurementQuote quote, AgreementSigning signing) {
        LegalDocumentMeta meta =
                registry.meta(DOC_ID)
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "Enterprise agreement not registered"));

        Map<String, String> tokens = tokens(quote, signing, meta);

        StringBuilder md = new StringBuilder();
        for (String part : meta.parts()) {
            if (md.length() > 0) md.append("\n\n");
            if ("@order-form".equals(part)) {
                md.append(LegalDocumentRegistry.fill(orderForm(quote, tokens), tokens));
            } else {
                md.append(LegalDocumentRegistry.fill(registry.readPart(meta, part), tokens));
            }
        }

        String variablesJson;
        try {
            variablesJson = objectMapper.writeValueAsString(tokens);
        } catch (Exception e) {
            variablesJson = "{}";
        }

        return new AssembledAgreement(
                meta.id(),
                meta.version(),
                meta.versionLabel(),
                meta.displayName(),
                meta.effectiveDate(),
                meta.status(),
                md.toString(),
                variablesJson);
    }

    private Map<String, String> tokens(
            ProcurementQuote quote, AgreementSigning signing, LegalDocumentMeta meta) {
        QuoteConfig cfg = toConfig(quote);
        boolean signed = signing != null;

        String legalName =
                signed && notBlank(signing.customerLegalName())
                        ? signing.customerLegalName().trim()
                        : (notBlank(quote.getBusinessName())
                                ? quote.getBusinessName().trim()
                                : "Customer");

        Map<String, String> t = new LinkedHashMap<>(registry.commonTokens(meta));
        t.put("effective_date", signed ? LocalDate.now().format(DATE) : "On signature");
        t.put("customer_legal_name", legalName);
        t.put("quote_ref", nz(quote.getQuoteNumber()));
        t.put("deployment", ProcurementPricingService.deploymentName(quote.getDeployment()));
        t.put("committed_pdfs_yr", String.format(Locale.US, "%,d", Math.max(0, quote.getVolume())));
        t.put("posture", ProcurementPricingService.postureName(quote.getIntensity()));
        t.put("processes_per_pdf", String.valueOf(Math.max(1, quote.getIntensity())));
        t.put("rate_per_pdf", String.format(Locale.US, "$%.4f", pricing.effectiveRatePerPdf(cfg)));
        t.put("term_years", String.valueOf(quote.getTermYears()));
        t.put("term_discount_pct", pricing.termDiscountPct(quote.getTermYears()) + "%");
        t.put("sla_tier", slaTier(quote.getServiceLevel()));
        t.put("annual_fee_y1", money(quote.getAnnualNetMinor()));
        t.put("elected_or_not", quote.isIndemnification() ? "Elected" : "Not elected");
        t.put("po_number", notBlank(quote.getPoNumber()) ? quote.getPoNumber().trim() : "—");
        t.put(
                "customer_signatory",
                signed && notBlank(signing.signatoryName())
                        ? signing.signatoryName().trim()
                        : BLANK);
        t.put(
                "customer_signatory_title",
                signed && notBlank(signing.signatoryTitle())
                        ? signing.signatoryTitle().trim()
                        : BLANK);
        return t;
    }

    /** Part B — the Order Form. Generated from the quote; the only per-deal section. */
    private String orderForm(ProcurementQuote quote, Map<String, String> t) {
        String date = t.get("effective_date");
        String signatory = t.get("customer_signatory");
        String signatoryTitle = t.get("customer_signatory_title");

        StringBuilder sb = new StringBuilder();
        sb.append("## Part B — Order Form · {{quote_ref}}\n\n");
        sb.append("| Term | Value |\n| --- | --- |\n");
        row(sb, "Customer", "{{customer_legal_name}}");
        row(sb, "Subscription", "Enterprise · {{deployment}}");
        row(sb, "Purchase order", "{{po_number}}");
        row(sb, "Committed Volume", "{{committed_pdfs_yr}} PDFs / year at the {{posture}} posture");
        row(sb, "Committed rate", "{{rate_per_pdf}} per PDF");
        row(sb, "Service level", "{{sla_tier}} (per SLA Exhibit)");
        row(
                sb,
                "Term",
                "{{term_years}} year(s) · term discount {{term_discount_pct}} on committed processing");
        row(sb, "Itemized services", itemizedServices(quote));
        row(sb, "Annual Fee (year 1)", "{{annual_fee_y1}}");
        row(sb, "Escalator", "+3% at each anniversary during the Term");
        row(sb, "Payment", "Annual in advance · net 30 · ACH, wire, or check");
        row(sb, "Overage", "Committed rate, billed quarterly in arrears");
        row(
                sb,
                "Data schedule",
                "First 25 MB per file included; each additional 25 MB or part thereof (decimal MB,"
                        + " rounded up per file, measured once at ingestion) draws down 1 PDF Process."
                        + " Frozen for the Term (MSA §3.5).");
        row(
                sb,
                "Drawdown schedule",
                "{{posture}}: {{processes_per_pdf}} PDF Processes per PDF (MSA §3.3, frozen for the Term)");
        row(
                sb,
                "Enhanced IP Protection",
                "{{elected_or_not}} — extends §7.3 to patent claims at the §8.2 super-cap");
        row(sb, "Standard terms", "SSO, SCIM, RBAC, and audit logs included.");

        sb.append(
                "\n**Itemized services menu (include as elected):** Self-hosted deployment $12,000/yr"
                        + " · Air-gapped deployment $36,000/yr · Dedicated SE/CSM $30,000/yr · Enhanced IP"
                        + " Protection (patent coverage, Section 7.3) 5% of committed processing fees ·"
                        + " Onboarding & training $7,500 one-time · Quarterly business reviews $8,000/yr."
                        + " Baseline IP indemnification (copyright, trademark, trade secret) is included at"
                        + " no charge.\n\n");
        sb.append(
                "**Signatures.** By signing, each signatory represents they have authority to bind"
                        + " their Party. Signatures delivered electronically or in counterparts are"
                        + " effective as originals.\n\n");
        sb.append("| Provider | Customer |\n| --- | --- |\n");
        sb.append("| Stirling PDF, Inc. | {{customer_legal_name}} |\n");
        sb.append("| Name: Matt Joseph | Name: ").append(signatory).append(" |\n");
        sb.append("| Title: CEO | Title: ").append(signatoryTitle).append(" |\n");
        sb.append("| Date: ").append(date).append(" | Date: ").append(date).append(" |\n");
        return sb.toString();
    }

    /**
     * The elected add-on lines, taken from the quote's stored breakdown (excludes the base meter).
     */
    private String itemizedServices(ProcurementQuote quote) {
        List<QuoteLineItem> lines = parseLineItems(quote.getLineItemsJson());
        List<String> elected = new ArrayList<>();
        for (QuoteLineItem li : lines) {
            if (li.key().equals("usage")
                    || li.key().equals("seats")
                    || li.key().equals("multi-year")) {
                continue;
            }
            String suffix = li.kind() == QuoteLineItem.Kind.ONE_TIME ? " (one-time)" : "/yr";
            elected.add(li.label() + " " + money(li.amountMinor()) + suffix);
        }
        return elected.isEmpty() ? "None elected" : String.join(" · ", elected);
    }

    private List<QuoteLineItem> parseLineItems(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(
                    json,
                    objectMapper
                            .getTypeFactory()
                            .constructCollectionType(List.class, QuoteLineItem.class));
        } catch (Exception e) {
            log.warn("[legal] could not parse quote line items for the order form", e);
            return List.of();
        }
    }

    private static QuoteConfig toConfig(ProcurementQuote q) {
        int users = q.getSeats() == null ? 0 : q.getSeats();
        return new QuoteConfig(
                q.getVolume(),
                users,
                q.getIntensity(),
                q.getSizeMult(),
                q.getDeployment(),
                q.getTermYears(),
                q.getServiceLevel(),
                q.isIndemnification(),
                q.isTraining(),
                q.isQbr(),
                q.getCurrency());
    }

    private static void row(StringBuilder sb, String term, String value) {
        sb.append("| ").append(term).append(" | ").append(value).append(" |\n");
    }

    private static String slaTier(String serviceLevel) {
        if ("dedicated".equalsIgnoreCase(serviceLevel)) return "Dedicated";
        if ("priority".equalsIgnoreCase(serviceLevel)) return "Priority";
        return "Standard";
    }

    /** Minor units (cents) → whole-dollar display; the quote figures are whole dollars. */
    private static String money(long minor) {
        return String.format(Locale.US, "$%,d", minor / 100L);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
