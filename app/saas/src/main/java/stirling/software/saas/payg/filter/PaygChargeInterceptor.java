package stirling.software.saas.payg.filter;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.servlet.AsyncHandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.cap.AiToolRoutes;
import stirling.software.saas.payg.cap.RequiresFeature;
import stirling.software.saas.payg.charge.ChargeContext;
import stirling.software.saas.payg.charge.ChargeOutcome;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.charge.JobInput;
import stirling.software.saas.payg.job.JobService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.JobStepStatus;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * The hot-path PAYG interceptor, registered in {@code PaygWebMvcConfig}.
 *
 * <p>{@code preHandle}: gates on {@code @AutoJobPostMapping} OR {@code @RequiresFeature} (the
 * latter lets AI controllers — JSON-bodied, no AutoJobPostMapping — bill correctly), reads the
 * parsed multipart parts, materialises each input to a {@code TempFile}, and asks {@link
 * JobChargeService#openProcess} to open (or join) a process. The resulting {@link ChargeOutcome}
 * plus input temp-files are stashed as request attributes for {@code afterCompletion}. Routes
 * without multipart inputs short-circuit inside {@code doPreHandle} without touching the charge
 * service.
 *
 * <p>{@code afterCompletion}: branches on HTTP status — 2xx hashes the response body for OUTPUT
 * lineage; 4xx records a step append for audit; 5xx triggers refund-and-close (OPENED) or
 * step-quota return (JOINED). Closes all input temp files and the response wrapper at the end.
 *
 * <p>Fail-open everywhere: any unexpected {@link RuntimeException} is swallowed, logged at WARN,
 * and counted on {@code payg.filter.errors}. The customer's tool call always proceeds.
 *
 * <p>Async controllers ({@code DeferredResult}, {@code CompletableFuture}) are handled
 * transparently — {@link AsyncHandlerInterceptor#afterConcurrentHandlingStarted} is a no-op; the
 * normal {@code afterCompletion} fires when the async work resolves.
 */
@Slf4j
@Component
@Profile("saas")
public class PaygChargeInterceptor implements AsyncHandlerInterceptor {

    static final String ATTR_JOB_ID = PaygChargeInterceptor.class.getName() + ".JOB_ID";
    static final String ATTR_DISPOSITION = PaygChargeInterceptor.class.getName() + ".DISPOSITION";
    static final String ATTR_INPUT_TEMP_FILES =
            PaygChargeInterceptor.class.getName() + ".INPUT_TEMP_FILES";
    static final String ATTR_INPUT_BYTES = PaygChargeInterceptor.class.getName() + ".INPUT_BYTES";
    static final String ATTR_FAILED = PaygChargeInterceptor.class.getName() + ".FAILED";
    static final String ATTR_TOOL_ID = PaygChargeInterceptor.class.getName() + ".TOOL_ID";

    private static final String AUTOMATION_HEADER = "X-Stirling-Automation";

    /**
     * Optional header the Tauri desktop shell sets so saas-side traffic from the embedded client
     * can be classified as {@link JobSource#DESKTOP_APP} instead of {@code WEB}. No anti-spoof —
     * V12 step limits for DESKTOP_APP and WEB are identical, so the worst-case abuse value is zero
     * today. Tighten if/when their limits diverge.
     */
    private static final String DESKTOP_CLIENT_HEADER = "X-Stirling-Client";

    /** Matches {@code processing_job_step.tool_id} column width (VARCHAR(128)). */
    private static final int TOOL_ID_MAX_LENGTH = 128;

    private final JobChargeService chargeService;
    private final JobService jobService;
    private final UserRepository userRepository;
    private final TempFileManager tempFileManager;
    private final PaygOutputExtractor outputExtractor;
    private final PaygFilterProperties properties;

    private final Counter errorsCounter;
    private final Counter callsOpened;
    private final Counter callsJoined;
    private final Counter callsShortCircuit;
    private final Counter callsBypassed;
    private final Counter refundsCounter;

    /** preHandle wall-clock per request. Separate from afterCompletion — different populations. */
    private final Timer preHandleTimer;

    /** afterCompletion wall-clock per request. Includes response hashing + step append + refund. */
    private final Timer afterCompletionTimer;

    public PaygChargeInterceptor(
            JobChargeService chargeService,
            JobService jobService,
            UserRepository userRepository,
            TempFileManager tempFileManager,
            PaygOutputExtractor outputExtractor,
            PaygFilterProperties properties,
            MeterRegistry meterRegistry) {
        this.chargeService = chargeService;
        this.jobService = jobService;
        this.userRepository = userRepository;
        this.tempFileManager = tempFileManager;
        this.outputExtractor = outputExtractor;
        this.properties = properties;

        this.errorsCounter =
                Counter.builder("payg.filter.errors")
                        .description("PAYG interceptor / filter internal failures")
                        .register(meterRegistry);
        this.callsOpened =
                Counter.builder("payg.filter.calls")
                        .tag("disposition", "OPENED")
                        .register(meterRegistry);
        this.callsJoined =
                Counter.builder("payg.filter.calls")
                        .tag("disposition", "JOINED")
                        .register(meterRegistry);
        this.callsShortCircuit =
                Counter.builder("payg.filter.calls")
                        .tag("disposition", "SHORT_CIRCUIT")
                        .register(meterRegistry);
        this.callsBypassed =
                Counter.builder("payg.filter.bypassed")
                        .description(
                                "Manual UI tool calls that skipped openProcess (BillingCategory.BYPASSED)")
                        .register(meterRegistry);
        this.refundsCounter =
                Counter.builder("payg.filter.refunds")
                        .description("First-step 5xx refunds applied to shadow rows")
                        .register(meterRegistry);
        this.preHandleTimer =
                Timer.builder("payg.filter.duration")
                        .tag("phase", "preHandle")
                        .description("preHandle wall-clock per request")
                        .register(meterRegistry);
        this.afterCompletionTimer =
                Timer.builder("payg.filter.duration")
                        .tag("phase", "afterCompletion")
                        .description("afterCompletion wall-clock per request")
                        .register(meterRegistry);
    }

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler) {
        Timer.Sample sample = Timer.start();
        try {
            if (!properties.isEnabled()) {
                return true;
            }
            if (!(handler instanceof HandlerMethod hm)) {
                callsShortCircuit.increment();
                return true;
            }
            // In-scope when the handler carries @AutoJobPostMapping (multipart tool POSTs) OR
            // @RequiresFeature (AI controllers, future non-multipart gated routes). Without one of
            // these the interceptor short-circuits — admin / info / static routes never run
            // determineCategory.
            boolean hasAutoJobPostMapping =
                    AnnotationUtils.findAnnotation(hm.getMethod(), AutoJobPostMapping.class) != null
                            || AnnotationUtils.findAnnotation(
                                            hm.getBeanType(), AutoJobPostMapping.class)
                                    != null;
            boolean hasRequiresFeature =
                    AnnotationUtils.findAnnotation(hm.getMethod(), RequiresFeature.class) != null
                            || AnnotationUtils.findAnnotation(
                                            hm.getBeanType(), RequiresFeature.class)
                                    != null;
            // AI document tools (/api/v1/ai/tools/**) live in the proprietary module and can't
            // carry @RequiresFeature, so they're recognised by path — see AiToolRoutes.
            boolean aiToolRoute = AiToolRoutes.matches(request);
            if (!hasAutoJobPostMapping && !hasRequiresFeature && !aiToolRoute) {
                callsShortCircuit.increment();
                return true;
            }
            // Bypass fast-path: determine the BillingCategory BEFORE any multipart
            // materialisation or openProcess call. Manual UI tool calls (BYPASSED) skip the
            // entire ledger/shadow pipeline — no temp files, no DB writes.
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            BillingCategory category = determineCategory(hm, request, auth);
            if (category == BillingCategory.BYPASSED) {
                callsBypassed.increment();
                return true;
            }
            try {
                doPreHandle(request, auth, category);
            } catch (RuntimeException e) {
                log.warn("PAYG preHandle failed; passing through unbilled", e);
                errorsCounter.increment();
                request.setAttribute(ATTR_FAILED, Boolean.TRUE);
                cleanupInputs(request);
            }
            return true;
        } finally {
            sample.stop(preHandleTimer);
        }
    }

    private void doPreHandle(
            HttpServletRequest request, Authentication auth, BillingCategory category) {
        User currentUser = resolveUser(auth);
        if (currentUser == null) {
            callsShortCircuit.increment();
            return;
        }

        if (!(request instanceof MultipartHttpServletRequest mreq)) {
            callsShortCircuit.increment();
            return;
        }

        MultiValueMap<String, MultipartFile> map = mreq.getMultiFileMap();
        List<MultipartFile> nonEmpty = new ArrayList<>();
        for (List<MultipartFile> bucket : map.values()) {
            for (MultipartFile mp : bucket) {
                if (mp.getSize() > 0) {
                    nonEmpty.add(mp);
                }
            }
        }
        if (nonEmpty.isEmpty()) {
            callsShortCircuit.increment();
            return;
        }

        List<TempFile> tempFiles = new ArrayList<>(nonEmpty.size());
        List<JobInput> inputs = new ArrayList<>(nonEmpty.size());
        long totalInputBytes = 0L;
        try {
            for (MultipartFile mp : nonEmpty) {
                TempFile tf = tempFileManager.createManagedTempFile(".upload");
                tempFiles.add(tf);
                try (InputStream in = mp.getInputStream();
                        OutputStream out = Files.newOutputStream(tf.getPath())) {
                    in.transferTo(out);
                }
                inputs.add(new JobInput(mp, tf.getPath()));
                totalInputBytes += mp.getSize();
            }
        } catch (IOException e) {
            for (TempFile tf : tempFiles) {
                tf.close();
            }
            throw new RuntimeException("Failed to materialise multipart input", e);
        }
        // Publish as an immutable list. preHandle fully populates `tempFiles` before this
        // setAttribute, and cleanupInputs / afterCompletion are read-only consumers — exposing
        // an unmodifiable view (a) makes the safe-publication guarantee from the container's
        // attribute-map synchronization unambiguous to readers on different threads (sync vs
        // async-dispatch), and (b) hard-fails any future caller that tries to mutate it.
        request.setAttribute(ATTR_INPUT_TEMP_FILES, Collections.unmodifiableList(tempFiles));
        request.setAttribute(ATTR_INPUT_BYTES, totalInputBytes);
        request.setAttribute(ATTR_TOOL_ID, resolveToolId(request));

        ChargeContext ctx =
                new ChargeContext(
                        currentUser.getId(),
                        currentUser.getTeam() == null ? null : currentUser.getTeam().getId(),
                        determineSource(request, auth),
                        ProcessType.SINGLE_TOOL,
                        category);

        ChargeOutcome outcome;
        try {
            outcome = chargeService.openProcess(ctx, inputs);
        } catch (IOException e) {
            throw new RuntimeException("openProcess IO failure", e);
        }
        request.setAttribute(ATTR_JOB_ID, outcome.processId());
        request.setAttribute(ATTR_DISPOSITION, outcome.disposition());

        if (outcome.disposition() == ChargeOutcome.Disposition.OPENED) {
            callsOpened.increment();
        } else {
            callsJoined.increment();
        }
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler,
            Exception ex) {
        Timer.Sample sample = Timer.start();
        try {
            if (Boolean.TRUE.equals(request.getAttribute(ATTR_FAILED))) {
                cleanupInputs(request);
                closeWrapper(request);
                return;
            }
            UUID jobId = (UUID) request.getAttribute(ATTR_JOB_ID);
            if (jobId == null) {
                closeWrapper(request);
                return;
            }
            try {
                doAfterCompletion(request, response, jobId);
            } catch (RuntimeException e) {
                log.warn(
                        "PAYG afterCompletion failed for job {}; lineage may be incomplete",
                        jobId,
                        e);
                errorsCounter.increment();
            } finally {
                cleanupInputs(request);
                closeWrapper(request);
            }
        } finally {
            sample.stop(afterCompletionTimer);
        }
    }

    private void doAfterCompletion(
            HttpServletRequest request, HttpServletResponse response, UUID jobId) {
        int status = response.getStatus();
        ChargeOutcome.Disposition disposition =
                (ChargeOutcome.Disposition) request.getAttribute(ATTR_DISPOSITION);
        String toolId =
                Optional.ofNullable((String) request.getAttribute(ATTR_TOOL_ID)).orElse("unknown");
        Long inputBytes = (Long) request.getAttribute(ATTR_INPUT_BYTES);

        // Step audit row — appended for every disposition + every outcome class. Done first so a
        // refund-and-close still has the failure recorded against the now-CLOSED process.
        JobStepStatus stepStatus = status < 400 ? JobStepStatus.OK : JobStepStatus.FAILED;
        String errorCode = status >= 400 ? String.valueOf(status) : null;
        try {
            jobService.appendStep(jobId, toolId, stepStatus, null, inputBytes, errorCode);
        } catch (RuntimeException e) {
            log.debug("appendStep failed for job {}: {}", jobId, e.getMessage());
        }

        if (status >= 500) {
            if (disposition == ChargeOutcome.Disposition.OPENED) {
                chargeService.markFirstStepFailed(jobId, "first-step-5xx:" + status);
                refundsCounter.increment();
            } else {
                chargeService.decrementStepCount(jobId);
            }
            return;
        }
        if (status >= 400) {
            // 4xx: customer paid for the attempt. No OUTPUT recording, no refund.
            // Still a successful-from-billing-standpoint OPENED process — meter it below.
            meterIfOpened(jobId, disposition);
            return;
        }

        // Success: this is the moment the billable work finished, so this is when we tell Stripe.
        // Only the OPENED request meters — JOINED follow-up steps (chained tools on the same
        // document) added no units and must not re-meter. The process stays OPEN for further
        // lineage joins; StaleJobCloser closing it later is a no-op at Stripe thanks to the shared
        // idempotency key. metering is best-effort and must never break the response teardown.
        meterIfOpened(jobId, disposition);
        recordOutputs(request, response, jobId);
    }

    /**
     * Fire the Stripe meter for a just-finished process, but only when this request OPENED it. Runs
     * on the request-teardown thread (the response is already flushed to the client); {@code
     * meterJobUsage} is best-effort and swallows its own failures, but we still guard here so a
     * meter hiccup can't disturb lineage/cleanup that follows.
     */
    private void meterIfOpened(UUID jobId, ChargeOutcome.Disposition disposition) {
        if (disposition != ChargeOutcome.Disposition.OPENED) {
            return;
        }
        try {
            chargeService.meterJobUsage(jobId);
        } catch (RuntimeException e) {
            log.warn("Meter-on-completion failed for job {}: {}", jobId, e.getMessage());
            errorsCounter.increment();
        }
    }

    private void recordOutputs(
            HttpServletRequest request, HttpServletResponse response, UUID jobId) {
        PaygResponseBodyWrapper wrapper =
                (PaygResponseBodyWrapper)
                        request.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE);
        if (wrapper == null) {
            return;
        }
        Long maxBytes = properties.getResponse().getMaxBytes();
        if (maxBytes != null && wrapper.bytesWritten() > maxBytes) {
            log.debug(
                    "Response size {} exceeds payg.filter.response.max-bytes={}; skipping OUTPUT recording",
                    wrapper.bytesWritten(),
                    maxBytes);
            return;
        }
        Path bodyPath;
        try {
            bodyPath = wrapper.materialisedPath();
        } catch (IOException e) {
            log.debug("materialisedPath failed for job {}: {}", jobId, e.getMessage());
            return;
        }
        if (bodyPath == null) {
            return;
        }
        List<PaygOutputExtractor.ExtractedPdf> pdfs =
                outputExtractor.extract(response.getContentType(), bodyPath);
        try {
            for (PaygOutputExtractor.ExtractedPdf pdf : pdfs) {
                try {
                    jobService.recordOutput(jobId, pdf.path());
                } catch (IOException e) {
                    log.debug(
                            "recordOutput failed for job {} path {}: {}",
                            jobId,
                            pdf.path(),
                            e.getMessage());
                }
            }
        } finally {
            for (PaygOutputExtractor.ExtractedPdf pdf : pdfs) {
                pdf.close();
            }
        }
    }

    @Override
    public void afterConcurrentHandlingStarted(
            HttpServletRequest request, HttpServletResponse response, Object handler) {
        // Async handoff: don't touch state. afterCompletion will fire when the async work resolves.
    }

    @SuppressWarnings("unchecked")
    private void cleanupInputs(HttpServletRequest request) {
        Object raw = request.getAttribute(ATTR_INPUT_TEMP_FILES);
        if (raw instanceof List<?>) {
            for (Object o : (List<Object>) raw) {
                if (o instanceof TempFile tf) {
                    tf.close();
                }
            }
        }
        request.removeAttribute(ATTR_INPUT_TEMP_FILES);
    }

    private void closeWrapper(HttpServletRequest request) {
        Object wrapper = request.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE);
        if (wrapper instanceof PaygResponseBodyWrapper w) {
            w.close();
        }
    }

    private User resolveUser(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        if (auth instanceof ApiKeyAuthenticationToken && auth.getPrincipal() instanceof User u) {
            return u;
        }
        try {
            String supabaseId = AuthenticationUtils.extractSupabaseId(auth);
            if (supabaseId == null) {
                return null;
            }
            UUID supabaseUuid = UUID.fromString(supabaseId);
            return userRepository.findBySupabaseId(supabaseUuid).orElse(null);
        } catch (RuntimeException e) {
            log.debug("PAYG resolveUser failed: {}", e.getMessage());
            return null;
        }
    }

    private static JobSource determineSource(HttpServletRequest request, Authentication auth) {
        String automationHeader = request.getHeader(AUTOMATION_HEADER);
        if (automationHeader != null && "true".equalsIgnoreCase(automationHeader.trim())) {
            return JobSource.PIPELINE;
        }
        String desktopHeader = request.getHeader(DESKTOP_CLIENT_HEADER);
        if (desktopHeader != null && "desktop".equalsIgnoreCase(desktopHeader.trim())) {
            return JobSource.DESKTOP_APP;
        }
        if (auth instanceof ApiKeyAuthenticationToken) {
            return JobSource.API;
        }
        return JobSource.WEB;
    }

    /**
     * Resolve the {@link BillingCategory} for this request. Precedence: {@code
     * X-Stirling-Automation: true} or {@code @RequiresFeature(AUTOMATION)} → AUTOMATION;
     * {@code @RequiresFeature(AI_SUPPORT)} → AI; an AI document-tool route ({@link AiToolRoutes}) →
     * AI; API-key auth → API; otherwise BYPASSED (manual UI tool — short-circuited in {@link
     * #preHandle}).
     *
     * <p>Method-level {@code @RequiresFeature} wins over class-level. Multiple gates: AUTOMATION
     * dominates AI within a single annotation. The AI-tool path check sits below the automation
     * header on purpose: an AI tool dispatched inside a policy / AI workflow bills as AUTOMATION,
     * while a direct call to it bills as AI.
     */
    private static BillingCategory determineCategory(
            HandlerMethod handler, HttpServletRequest request, Authentication auth) {
        String automationHeader = request.getHeader(AUTOMATION_HEADER);
        if (automationHeader != null && "true".equalsIgnoreCase(automationHeader.trim())) {
            return BillingCategory.AUTOMATION;
        }
        RequiresFeature ann =
                AnnotationUtils.findAnnotation(handler.getMethod(), RequiresFeature.class);
        if (ann == null) {
            ann = AnnotationUtils.findAnnotation(handler.getBeanType(), RequiresFeature.class);
        }
        if (ann != null) {
            boolean ai = false;
            for (FeatureGate gate : ann.value()) {
                if (gate == FeatureGate.AUTOMATION) {
                    return BillingCategory.AUTOMATION;
                }
                if (gate == FeatureGate.AI_SUPPORT) {
                    ai = true;
                }
            }
            if (ai) {
                return BillingCategory.AI;
            }
        }
        // AI document tools (proprietary module, recognised by path). A direct call bills as AI; an
        // orchestrator-dispatched call already returned AUTOMATION above via the automation header.
        if (AiToolRoutes.matches(request)) {
            return BillingCategory.AI;
        }
        if (auth instanceof ApiKeyAuthenticationToken) {
            return BillingCategory.API;
        }
        return BillingCategory.BYPASSED;
    }

    /**
     * Resolves the {@code tool_id} value stored on {@code processing_job_step}. Prefers the route
     * pattern (e.g. {@code /api/v1/security/add-password}) over the raw URI so audit rollups
     * aggregate by endpoint rather than by request — path variables, query strings, and matrix
     * params don't pollute the column. Falls back to the raw URI when the pattern isn't available
     * (non-Spring-MVC dispatches, async re-dispatch edges).
     *
     * <p>Truncates to {@link #TOOL_ID_MAX_LENGTH} to match the column's {@code VARCHAR(128)} width.
     * Logs at WARN + increments {@link #errorsCounter} when truncation actually happens so support
     * notices the {@code tool_id} they expected isn't what we stored.
     */
    private String resolveToolId(HttpServletRequest request) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String value = pattern instanceof String s ? s : request.getRequestURI();
        if (value == null) {
            return "unknown";
        }
        if (value.length() <= TOOL_ID_MAX_LENGTH) {
            return value;
        }
        log.warn(
                "tool_id length {} exceeds column max {}; truncating. value='{}'",
                value.length(),
                TOOL_ID_MAX_LENGTH,
                value);
        errorsCounter.increment();
        return value.substring(0, TOOL_ID_MAX_LENGTH);
    }
}
