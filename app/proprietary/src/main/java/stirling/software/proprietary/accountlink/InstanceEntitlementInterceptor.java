package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.security.SecurityContextHolder;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.ContentHasher;
import stirling.software.proprietary.billing.DocumentUnitCalculator;
import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;
import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.proprietary.policy.controller.PolicyRunRoutes;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;

/**
 * Request-time gate + meter for combined-billing "Mode A". {@code preHandle} blocks billable (API /
 * AI / automation) work when the instance is unlinked or over its limit; manual tools pass through.
 * {@code afterCompletion} meters a successful billable op into the per-period cumulative counter.
 *
 * <p>Blocking responds {@code 402} with a machine-readable body the FE maps to a "link to activate"
 * prompt; fail-open and flag-off both let the request continue. Metering is separately gated behind
 * {@code …metering.enabled}, tested before every accrual — switch off means nothing accrues, while
 * the gate still works.
 */
// Servlet filter retained (quarkus-undertow): only the servlet API exposes the parsed multipart
// parts, the attribute preHandle/afterCompletion pass the category through, and the raw status.
// Arc cannot gate a bean on a runtime property, so the account-link flag no longer removes this
// bean; doFilter reads the flag itself and passes straight through, as bean-absence used to.
@Slf4j
@ApplicationScoped
@IfBuildProfile("!saas")
@WebFilter("/*")
public class InstanceEntitlementInterceptor implements Filter {

    private static final String ATTR_CATEGORY =
            InstanceEntitlementInterceptor.class.getName() + ".category";

    // Field injection, not constructor: Undertow instantiates a @WebFilter through the servlet
    // container's instance factory, which needs a no-arg constructor.
    @Inject InstanceEntitlementGate gate;
    @Inject EntitlementCache entitlementCache;
    @Inject AccountLinkProperties properties;
    @Inject Instance<UsageMeterService> meterProvider;
    @Inject TempFileManager tempFileManager;

    @Override
    public void doFilter(
            ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        // Self-gate on the path scope the InterceptorRegistry used to apply (see
        // AccountLinkWebMvcConfig): a filter mapped to /* is handed every request.
        if (!properties.isEnabled() || !AccountLinkWebMvcConfig.isGated(request.getRequestURI())) {
            filterChain.doFilter(request, response);
            return;
        }
        if (!preHandle(request, response)) {
            return;
        }
        // A throwing chain is the `ex` Spring handed afterCompletion - same "don't meter" signal.
        Exception failure = null;
        try {
            filterChain.doFilter(request, response);
        } catch (IOException | ServletException | RuntimeException e) {
            failure = e;
            throw e;
        } finally {
            afterCompletion(request, response, failure);
        }
    }

    // Package-private, not private: the two phases stay individually drivable from the unit test,
    // the way HandlerInterceptor's were.
    boolean preHandle(HttpServletRequest request, HttpServletResponse response) throws IOException {
        GateDecision decision;
        try {
            // API-key tool calls are billable (category API); stash the category for the meter.
            boolean apiKey =
                    SecurityContextHolder.getContext().getAuthentication()
                            instanceof ApiKeyAuthenticationToken;
            BillingCategory category = BillableOperationClassifier.categorize(request, apiKey);
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
        response.setStatus(Response.Status.PAYMENT_REQUIRED.getStatusCode());
        response.setContentType("application/json");
        response.getWriter()
                .write(
                        "{\"error\":\"ACCOUNT_LINK_REQUIRED\",\"reason\":\""
                                + decision.reason().name()
                                + "\"}");
        return false;
    }

    void afterCompletion(HttpServletRequest request, HttpServletResponse response, Exception ex) {
        // Meter successful billable ops only.
        if (ex != null || response.getStatus() >= 400) {
            return;
        }
        if (!properties.getMetering().isEnabled() || !meterProvider.isResolvable()) {
            return; // metering switch off
        }
        UsageMeterService meter = meterProvider.get();
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
     * Computes doc-units (page + byte axes) and the input-set signature, then accrues. The instance
     * is authoritative for units (SaaS bills the delta and never sees the file), so a page-heavy
     * but small PDF must be page-counted or it under-bills. A fileless op has no input identity —
     * null signature (no dedup), billed the 1-unit floor each time.
     */
    private void meterRequest(
            HttpServletRequest request,
            BillingCategory category,
            InstanceEntitlement ent,
            UsageMeterService meter) {
        UnitCalcPolicy policy = ent.unitCalcPolicy();
        List<Part> fileParts = fileParts(request);
        if (fileParts == null) {
            long fileless = DocumentUnitCalculator.unitsForFile(0, 0, policy);
            meter.accrue(ent.periodStart(), category, fileless, null);
            return;
        }
        List<TempFile> temps = new ArrayList<>();
        try {
            List<FileSize> sizes = new ArrayList<>();
            List<String> hashes = new ArrayList<>();
            int fileCount = 0;
            for (Part f : fileParts) {
                fileCount++;
                try {
                    TempFile temp = tempFileManager.createManagedTempFile(".bin");
                    temps.add(temp);
                    // Hash in the same pass that writes the temp file — one read of the upload,
                    // not a second full read just to fingerprint it.
                    MessageDigest digest = ContentHasher.newSha256();
                    try (InputStream in = f.getInputStream();
                            DigestOutputStream out =
                                    new DigestOutputStream(
                                            Files.newOutputStream(temp.getPath()), digest)) {
                        in.transferTo(out);
                    }
                    sizes.add(new FileSize(pageCount(temp.getPath(), f), f.getSize()));
                    hashes.add(ContentHasher.toHex(digest.digest()));
                } catch (IOException | RuntimeException perFile) {
                    // Couldn't materialise/hash this input — bill on bytes only and, by leaving
                    // it out of `hashes`, drop dedup for the whole op rather than risk a
                    // mismatch.
                    log.debug(
                            "Metering materialise/hash failed for {}; bytes-only",
                            f.getSubmittedFileName());
                    sizes.add(new FileSize(0, f.getSize()));
                }
            }
            long units =
                    sizes.isEmpty()
                            ? DocumentUnitCalculator.unitsForFile(0, 0, policy)
                            : DocumentUnitCalculator.unitsForGroup(sizes, policy);
            // Only dedup when every input hashed; a partial signature could collide with a
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

    /**
     * The uploaded inputs - parts carrying a filename, exactly what Spring's multi-file map held -
     * or null when the request is not multipart at all (the fileless op main spotted by the absence
     * of a native multipart request). Parts that can no longer be read yield none, billing the same
     * 1-unit floor as a fileless op rather than inventing inputs.
     */
    private static List<Part> fileParts(HttpServletRequest request) {
        String contentType = request.getContentType();
        if (contentType == null || !contentType.toLowerCase().startsWith("multipart/form-data")) {
            return null;
        }
        List<Part> files = new ArrayList<>();
        try {
            Collection<Part> parts = request.getParts();
            if (parts != null) {
                for (Part part : parts) {
                    if (part.getSubmittedFileName() != null) {
                        files.add(part);
                    }
                }
            }
        } catch (IOException | ServletException | RuntimeException e) {
            log.debug("Metering could not read the multipart parts of {}", request.getRequestURI());
        }
        return files;
    }

    /** Page count via jpdfium (parser-identical to SaaS); 0 for non-PDF / unreadable inputs. */
    private static int pageCount(Path path, Part file) {
        if (!isPdf(file)) {
            return 0;
        }
        try (PdfDocument doc = PdfDocument.open(path)) {
            return doc.pageCount();
        } catch (RuntimeException e) {
            // Malformed / encrypted → byte axis only, matching the SaaS classifier.
            log.debug(
                    "Page count unavailable for {}; metering on bytes only",
                    file.getSubmittedFileName());
            return 0;
        }
    }

    /** Order-independent signature of the input set: sorted per-file hashes, hashed together. */
    private static String opSignature(List<String> hashes) {
        List<String> sorted = new ArrayList<>(hashes);
        Collections.sort(sorted);
        return ContentHasher.sha256(String.join("\n", sorted).getBytes(StandardCharsets.UTF_8));
    }

    private static boolean isPdf(Part file) {
        String contentType = file.getContentType();
        if (contentType != null && contentType.toLowerCase().contains("pdf")) {
            return true;
        }
        String name = file.getSubmittedFileName();
        return name != null && name.toLowerCase().endsWith(".pdf");
    }
}
