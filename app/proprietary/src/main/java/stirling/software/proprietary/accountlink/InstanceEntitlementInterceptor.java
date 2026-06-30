package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
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

import stirling.software.proprietary.billing.BillingCategory;
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

    public InstanceEntitlementInterceptor(
            InstanceEntitlementGate gate,
            EntitlementCache entitlementCache,
            ObjectProvider<UsageMeterService> meterProvider) {
        this.gate = gate;
        this.entitlementCache = entitlementCache;
        this.meterProvider = meterProvider;
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
            meter.accrue(ent.periodStart(), category, computeUnits(request, ent.unitCalcPolicy()));
        } catch (RuntimeException e) {
            // Metering must never affect the response that already completed.
            log.debug("Usage metering failed for {}", request.getRequestURI(), e);
        }
    }

    // Bytes above this aren't page-counted: parsing a huge upload on the metering path isn't worth
    // it, and the byte axis already dominates the unit count at that size.
    private static final long MAX_BYTES_FOR_PAGE_COUNT = 50L * 1024 * 1024;

    /**
     * Doc-units for this request via the shared calculator, on both the page and byte axes. The
     * instance is authoritative for units here — SaaS bills the delta of what we report and never
     * sees the file — so a page-heavy but small PDF must be page-counted or it under-bills. A
     * non-file billable op costs 1 unit.
     */
    private static long computeUnits(HttpServletRequest request, UnitCalcPolicy policy) {
        MultipartHttpServletRequest mreq =
                WebUtils.getNativeRequest(request, MultipartHttpServletRequest.class);
        if (mreq == null) {
            return DocumentUnitCalculator.unitsForFile(0, 0, policy);
        }
        List<FileSize> sizes = new ArrayList<>();
        for (List<MultipartFile> files : mreq.getMultiFileMap().values()) {
            for (MultipartFile f : files) {
                sizes.add(new FileSize(pageCount(f), f.getSize()));
            }
        }
        return sizes.isEmpty()
                ? DocumentUnitCalculator.unitsForFile(0, 0, policy)
                : DocumentUnitCalculator.unitsForGroup(sizes, policy);
    }

    /**
     * Page count for a PDF upload, or 0 for non-PDFs / oversized / unreadable inputs — the byte
     * axis still produces a charge, matching the SaaS classifier's malformed-PDF fallback.
     */
    private static int pageCount(MultipartFile file) {
        long size = file.getSize();
        if (!isPdf(file) || size <= 0 || size > MAX_BYTES_FOR_PAGE_COUNT) {
            return 0;
        }
        try (PDDocument doc = Loader.loadPDF(file.getBytes())) {
            return doc.getNumberOfPages();
        } catch (IOException | RuntimeException e) {
            // Malformed / encrypted / already-consumed part → fall back to the byte axis only.
            log.debug(
                    "Page count unavailable for {}; metering on bytes only",
                    file.getOriginalFilename());
            return 0;
        }
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
