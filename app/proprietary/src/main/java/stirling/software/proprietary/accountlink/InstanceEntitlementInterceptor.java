package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.util.WebUtils;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.service.AutomationRunContext;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.DocumentUnitCalculator;
import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;
import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.proprietary.policy.controller.PolicyRunRoutes;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;

/**
 * Request-time gate + meter for combined billing. {@code preHandle} blocks billable (API / AI /
 * automation) work when the instance is unlinked or over its limit; manual tools pass through.
 * {@code afterCompletion} meters a successful billable op into the per-period cumulative counter.
 *
 * <p>Blocking responds {@code 402} with a machine-readable body the FE maps to a "link to activate"
 * prompt; fail-open and flag-off both let the request continue. Metering is separately gated behind
 * {@code …metering.enabled} via {@link ObjectProvider} — switch off means the {@link
 * UsageMeterService} bean is absent and nothing accrues, while the gate still works.
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
            // API-key tool calls are billable (category API); stash the category for the meter.
            boolean apiKey =
                    SecurityContextHolder.getContext().getAuthentication()
                            instanceof ApiKeyAuthenticationToken;
            BillingCategory category = BillableOperationClassifier.categorize(request, apiKey);
            // API bills only for actual tool endpoints (@AutoJobPostMapping), matching the SaaS
            // scope gate; a non-tool API-key call (info / config / download) is not billed.
            if (category == BillingCategory.API && !isToolEndpoint(handler)) {
                category = BillingCategory.BYPASSED;
            }
            request.setAttribute(ATTR_CATEGORY, category);
            // A policy run kicks off billable automation, so block it up front when unentitled
            // rather than after its first tool. It carries no automation header itself (category
            // BYPASSED), so it's gated here but metered only via its dispatched sub-steps - keeping
            // the BYPASSED meter category avoids double-counting.
            boolean billable =
                    category != BillingCategory.BYPASSED || PolicyRunRoutes.matches(request);
            decision = gate.evaluate(billable);
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

    /**
     * True when the handler is a tool endpoint - carries {@link AutoJobPostMapping} on the method
     * or its controller. Mirrors the SaaS scope gate so API-key calls bill only on tool endpoints.
     */
    private static boolean isToolEndpoint(Object handler) {
        if (!(handler instanceof HandlerMethod hm)) {
            return false;
        }
        return AnnotationUtils.findAnnotation(hm.getMethod(), AutoJobPostMapping.class) != null
                || AnnotationUtils.findAnnotation(hm.getBeanType(), AutoJobPostMapping.class)
                        != null;
    }

    /**
     * The automation run id ({@link AutomationRunContext#RUN_ID_HEADER}) when this is a genuine
     * internal dispatch (carries {@link InternalApiClient#AUTOMATION_HEADER}); {@code null}
     * otherwise. Gated on the automation header so a raw caller can't pin a run id to collapse its
     * separate calls into one charge - the same trust boundary the SaaS interceptor applies.
     */
    private static String automationRunId(HttpServletRequest request) {
        if (request.getHeader(InternalApiClient.AUTOMATION_HEADER) == null) {
            return null;
        }
        String runId = request.getHeader(AutomationRunContext.RUN_ID_HEADER);
        return runId != null && !runId.isBlank() ? runId : null;
    }

    /**
     * The per-document id ({@link AutomationRunContext#DOCUMENT_ID_HEADER}) on a genuine internal
     * dispatch, else {@code null} - same automation-header trust boundary as {@link
     * #automationRunId}. Each source document gets its own charge grouping and step allowance.
     */
    private static String automationDocumentId(HttpServletRequest request) {
        if (request.getHeader(InternalApiClient.AUTOMATION_HEADER) == null) {
            return null;
        }
        String documentId = request.getHeader(AutomationRunContext.DOCUMENT_ID_HEADER);
        return documentId != null && !documentId.isBlank() ? documentId : null;
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
     * Computes doc-units (page + byte axes) and the dedup key, then accrues. The instance is
     * authoritative for units (SaaS bills the delta and never sees the file), so a page-heavy but
     * small PDF must be page-counted or it under-bills.
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
            return; // a fileless op has no document to charge for - matching SaaS, which skips it
        }
        List<TempFile> temps = new ArrayList<>();
        try {
            List<FileSize> sizes = new ArrayList<>();
            for (List<MultipartFile> files : mreq.getMultiFileMap().values()) {
                for (MultipartFile f : files) {
                    if (f.getSize() <= 0) {
                        continue; // skip empty parts, matching SaaS's non-empty input filter
                    }
                    sizes.add(new FileSize(pageCount(f, temps), f.getSize()));
                }
            }
            if (sizes.isEmpty()) {
                return; // no non-empty input, so nothing billable - matching SaaS
            }
            // Prefer the per-document key so each source document has its own step allowance;
            // fall back to the whole-run key for automation sub-steps with no document id. A
            // standalone op has no key (null) and always accrues - each call is its own charge.
            String runKey = automationDocumentId(request);
            if (runKey == null) {
                runKey = automationRunId(request);
            }
            long units = DocumentUnitCalculator.unitsForGroup(sizes, policy);
            meter.accrue(ent.periodStart(), category, units, runKey, ent.automationStepLimit());
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

    /**
     * Page count via jpdfium (parser-identical to SaaS); 0 for a non-PDF or unreadable input. A PDF
     * is materialised to a managed temp file (added to {@code temps} for the caller to close) so
     * jpdfium can read it; a non-PDF needs no temp.
     */
    private int pageCount(MultipartFile file, List<TempFile> temps) {
        if (!isPdf(file)) {
            return 0;
        }
        try {
            TempFile temp = tempFileManager.createManagedTempFile(".bin");
            temps.add(temp);
            try (InputStream in = file.getInputStream();
                    OutputStream out = Files.newOutputStream(temp.getPath())) {
                in.transferTo(out);
            }
            try (PdfDocument doc = PdfDocument.open(temp.getPath())) {
                return doc.pageCount();
            }
        } catch (IOException | RuntimeException e) {
            // Malformed / encrypted / unreadable -> byte axis only, matching the SaaS classifier.
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
