package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.util.WebUtils;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.ContentHasher;
import stirling.software.proprietary.billing.DocumentUnitCalculator;
import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;
import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;

/**
 * Request-time gate + meter for combined-billing "Mode A". {@code preHandle} classifies the request
 * and blocks billable (API / AI / automation) work when the instance is unlinked or over its limit;
 * manual tools pass straight through. {@code afterCompletion} meters a <em>successful</em> billable
 * op into the per-period cumulative counter (the daily sync later reports the totals).
 *
 * <p>Metering materialises each uploaded input once to a temp file and reads it twice from disk:
 * the page count via <b>jpdfium</b> (parser-identical to the SaaS classifier, so the page axis
 * can't drift between instance and cloud) and a SHA-256 via the shared {@link ContentHasher} (the
 * input-set signature for lineage dedup — a re-submission of the identical inputs isn't re-charged,
 * matching the in-cloud lineage join). Either read failing degrades gracefully to bytes-only.
 *
 * <p>Blocking responds {@code 402 Payment Required} with a small machine-readable body — {@code
 * {"error":"ACCOUNT_LINK_REQUIRED","reason":"NOT_LINKED"}} — that the FE maps to a "link to
 * activate" prompt. Fail-open and flag-off both let the request continue.
 *
 * <p>Gated + {@code @Profile("!saas")}; metering is additionally gated behind {@code
 * …account-link.metering.enabled} via an {@link ObjectProvider} — when that switch is off the
 * {@link UsageMeterService} bean is absent and nothing accrues, while the gate still works.
 */
@Slf4j
@Component
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceEntitlementInterceptor implements HandlerInterceptor {

    private static final String ATTR_CATEGORY =
            InstanceEntitlementInterceptor.class.getName() + ".category";

    private final InstanceEntitlementGate gate;
    private final EntitlementCache entitlementCache;
    private final ObjectProvider<UsageMeterService> meterProvider;
    private final TempFileManager tempFileManager;

    public InstanceEntitlementInterceptor(
            InstanceEntitlementGate gate,
            EntitlementCache entitlementCache,
            ObjectProvider<UsageMeterService> meterProvider,
            TempFileManager tempFileManager) {
        this.gate = gate;
        this.entitlementCache = entitlementCache;
        this.meterProvider = meterProvider;
        this.tempFileManager = tempFileManager;
    }

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        GateDecision decision;
        try {
            // API-key tool calls are billable too (category API), so resolve the auth principal and
            // gate on "not a manual UI tool". Stash the category for afterCompletion's meter.
            boolean apiKey =
                    SecurityContextHolder.getContext().getAuthentication()
                            instanceof ApiKeyAuthenticationToken;
            BillingCategory category = BillableOperationClassifier.categorize(request, apiKey);
            request.setAttribute(ATTR_CATEGORY, category);
            decision = gate.evaluate(category != BillingCategory.BYPASSED);
        } catch (RuntimeException e) {
            // Fail open: an inability to resolve entitlement (e.g. a DB or SaaS blip) must never
            // turn into a hard block on billable work.
            log.debug("Account-link gate evaluation failed; allowing request", e);
            return true;
        }
        if (decision.allowed()) {
            return true;
        }

        log.debug("Account-link gate blocked {} ({})", request.getRequestURI(), decision.reason());
        response.setStatus(HttpStatus.PAYMENT_REQUIRED.value());
        response.setContentType("application/json");
        response.getWriter()
                .write(
                        "{\"error\":\"ACCOUNT_LINK_REQUIRED\",\"reason\":\""
                                + decision.reason().name()
                                + "\"}");
        return false;
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler,
            Exception ex) {
        // Meter successful billable ops only.
        if (ex != null || response.getStatus() >= 400) {
            return;
        }
        UsageMeterService meter = meterProvider.getIfAvailable();
        if (meter == null) {
            return; // metering switch off
        }
        if (!(request.getAttribute(ATTR_CATEGORY) instanceof BillingCategory category)
                || category == BillingCategory.BYPASSED) {
            return;
        }
        try {
            InstanceEntitlement ent = entitlementCache.current().orElse(null);
            if (ent == null || ent.unitCalcPolicy() == null || ent.periodStart() == null) {
                // Not yet synced (no policy/period) — can't compute units; skip until next sync.
                return;
            }
            meterRequest(request, category, ent, meter);
        } catch (RuntimeException e) {
            // Metering must never affect the response that already completed.
            log.debug("Usage metering failed for {}", request.getRequestURI(), e);
        }
    }

    /**
     * Computes doc-units (page + byte axes) and the input-set signature for the request, then
     * accrues. The instance is authoritative for units — SaaS bills the delta of what we report and
     * never sees the file — so a page-heavy but small PDF must be page-counted or it under-bills. A
     * fileless billable op has no input identity, so it carries a null signature (no dedup) and is
     * billed the 1-unit floor each time.
     */
    private void meterRequest(
            HttpServletRequest request,
            BillingCategory category,
            InstanceEntitlement ent,
            UsageMeterService meter) {
        UnitCalcPolicy policy = ent.unitCalcPolicy();
        MultipartHttpServletRequest mreq =
                WebUtils.getNativeRequest(request, MultipartHttpServletRequest.class);
        if (mreq == null) {
            meter.accrue(
                    ent.periodStart(),
                    category,
                    DocumentUnitCalculator.unitsForFile(0, 0, policy),
                    null);
            return;
        }
        List<TempFile> temps = new ArrayList<>();
        try {
            List<FileSize> sizes = new ArrayList<>();
            List<String> hashes = new ArrayList<>();
            int fileCount = 0;
            for (List<MultipartFile> files : mreq.getMultiFileMap().values()) {
                for (MultipartFile f : files) {
                    fileCount++;
                    try {
                        TempFile temp = tempFileManager.createManagedTempFile(".bin");
                        temps.add(temp);
                        try (InputStream in = f.getInputStream();
                                OutputStream out = Files.newOutputStream(temp.getPath())) {
                            in.transferTo(out);
                        }
                        sizes.add(new FileSize(pageCount(temp.getPath(), f), f.getSize()));
                        hashes.add(ContentHasher.sha256(temp.getPath()));
                    } catch (IOException | RuntimeException perFile) {
                        // Couldn't materialise/hash this input — bill it on bytes only and (by
                        // leaving it out of `hashes`) drop dedup for the whole op rather than risk
                        // a
                        // wrong match.
                        log.debug(
                                "Metering materialise/hash failed for {}; bytes-only",
                                f.getOriginalFilename());
                        sizes.add(new FileSize(0, f.getSize()));
                    }
                }
            }
            long units =
                    sizes.isEmpty()
                            ? DocumentUnitCalculator.unitsForFile(0, 0, policy)
                            : DocumentUnitCalculator.unitsForGroup(sizes, policy);
            // Only dedup when every input hashed — a partial signature could collide with a
            // different input set, so fall back to no-dedup (bill it) if any file failed.
            String opSignature =
                    fileCount > 0 && hashes.size() == fileCount ? opSignature(hashes) : null;
            meter.accrue(ent.periodStart(), category, units, opSignature);
        } finally {
            for (TempFile temp : temps) {
                try {
                    temp.close();
                } catch (RuntimeException cleanup) {
                    log.debug("Temp file cleanup failed: {}", cleanup.getMessage());
                }
            }
        }
    }

    /** Page count via jpdfium (parser-identical to SaaS); 0 for non-PDF / unreadable inputs. */
    private static int pageCount(Path path, MultipartFile file) {
        if (!isPdf(file)) {
            return 0;
        }
        try (PdfDocument doc = PdfDocument.open(path)) {
            return doc.pageCount();
        } catch (RuntimeException e) {
            // Malformed / encrypted → fall back to the byte axis only, matching the SaaS
            // classifier.
            log.debug(
                    "Page count unavailable for {}; metering on bytes only",
                    file.getOriginalFilename());
            return 0;
        }
    }

    /** Order-independent signature of the input set: sorted per-file hashes, hashed together. */
    private static String opSignature(List<String> hashes) {
        List<String> sorted = new ArrayList<>(hashes);
        Collections.sort(sorted);
        return ContentHasher.sha256(String.join("\n", sorted).getBytes(StandardCharsets.UTF_8));
    }

    private static boolean isPdf(MultipartFile file) {
        String contentType = file.getContentType();
        if (contentType != null && contentType.toLowerCase().contains("pdf")) {
            return true;
        }
        String name = file.getOriginalFilename();
        return name != null && name.toLowerCase().endsWith(".pdf");
    }
}
