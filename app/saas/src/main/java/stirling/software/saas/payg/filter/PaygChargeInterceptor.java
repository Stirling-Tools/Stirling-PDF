package stirling.software.saas.payg.filter;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.charge.ChargeContext;
import stirling.software.saas.payg.charge.ChargeOutcome;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.charge.JobInput;
import stirling.software.saas.payg.job.JobService;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.JobStepStatus;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * The hot-path PAYG interceptor. Mirrors the {@code UnifiedCreditInterceptor} shape: registered
 * after it in {@code PaygWebMvcConfig} so legacy credit-rejection short-circuits before we waste
 * work hashing inputs.
 *
 * <p>{@code preHandle}: gates on {@code @AutoJobPostMapping}, reads the parsed multipart parts,
 * materialises each input to a {@code TempFile}, and asks {@link JobChargeService#openProcess} to
 * open (or join) a process. The resulting {@link ChargeOutcome} plus input temp-files are stashed
 * as request attributes for {@code afterCompletion}.
 *
 * <p>{@code afterCompletion}: branches on HTTP status — 2xx hashes the response body for OUTPUT
 * lineage; 4xx records a step append for audit; 5xx triggers refund-and-close (OPENED) or
 * step-quota return (JOINED). Closes all input temp files and the response wrapper at the end.
 *
 * <p>Fail-open everywhere: any unexpected {@link RuntimeException} is swallowed, logged at WARN,
 * and counted on {@code payg.filter.errors}. The customer's tool call always proceeds.
 *
 * <p>// TODO: Migration required - was a Spring {@code @Component} ({@code @Profile("saas")})
 * implementing {@code org.springframework.web.servlet.AsyncHandlerInterceptor}. Convert to a JAX-RS
 * {@code @jakarta.ws.rs.ext.Provider} request/response filter pair. The Spring MVC types {@code
 * HandlerMethod}, {@code HandlerMapping}, {@code MultiValueMap}, {@code MultipartFile} and {@code
 * MultipartHttpServletRequest} have been removed: handler-annotation introspection now uses a
 * reflective {@link Method} fallback (see {@link #resolveResourceMethod}); multipart access now
 * uses the servlet-native {@link Part} API ({@code request.getParts()}); the best-matching-pattern
 * attribute now uses a literal key constant ({@link #BEST_MATCHING_PATTERN_ATTRIBUTE}).
 *
 * <p>// TODO: Migration required - {@link JobInput}'s {@code multipart} component is still typed as
 * Spring {@code org.springframework.web.multipart.MultipartFile} (that class is owned by another
 * module slated for migration). This interceptor now produces {@link Part} inputs; once {@code
 * JobInput} is migrated to carry a {@link Part} (or a neutral metadata holder exposing size +
 * content-type), {@link #buildJobInput(Part, Path)} must construct it directly. Until then that
 * helper documents the adaptation point.
 */
@Slf4j
@ApplicationScoped
public class PaygChargeInterceptor {

    static final String ATTR_JOB_ID = PaygChargeInterceptor.class.getName() + ".JOB_ID";
    static final String ATTR_DISPOSITION = PaygChargeInterceptor.class.getName() + ".DISPOSITION";
    static final String ATTR_INPUT_TEMP_FILES =
            PaygChargeInterceptor.class.getName() + ".INPUT_TEMP_FILES";
    static final String ATTR_INPUT_BYTES = PaygChargeInterceptor.class.getName() + ".INPUT_BYTES";
    static final String ATTR_FAILED = PaygChargeInterceptor.class.getName() + ".FAILED";
    static final String ATTR_TOOL_ID = PaygChargeInterceptor.class.getName() + ".TOOL_ID";

    private static final String AUTOMATION_HEADER = "X-Stirling-Automation";

    /**
     * // TODO: Migration required - literal value of the former Spring constant {@code
     * HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE}. Replace with the JAX-RS route template
     * obtained from {@code @Context UriInfo} / {@code ResourceInfo} during the filter conversion.
     */
    private static final String BEST_MATCHING_PATTERN_ATTRIBUTE =
            "org.springframework.web.servlet.HandlerMapping.bestMatchingPattern";

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

    // TODO: Migration required - was @Override AsyncHandlerInterceptor#preHandle(request, response,
    // handler). Convert to a JAX-RS ContainerRequestFilter.
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler) {
        Timer.Sample sample = Timer.start();
        try {
            if (!properties.isEnabled()) {
                return true;
            }
            Method resourceMethod = resolveResourceMethod(handler);
            if (resourceMethod == null
                    || resourceMethod.getAnnotation(AutoJobPostMapping.class) == null) {
                callsShortCircuit.increment();
                return true;
            }
            try {
                doPreHandle(request);
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

    private void doPreHandle(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        User currentUser = resolveUser(auth);
        if (currentUser == null) {
            callsShortCircuit.increment();
            return;
        }

        // TODO: Migration required - was `request instanceof MultipartHttpServletRequest mreq` +
        // mreq.getMultiFileMap(). Now uses servlet-native request.getParts(). A non-multipart
        // request
        // yields no file parts and short-circuits, preserving the original behavior.
        List<Part> nonEmpty = new ArrayList<>();
        try {
            Collection<Part> parts = request.getParts();
            if (parts != null) {
                for (Part part : parts) {
                    // Only treat parts that carry an uploaded file (have a filename) and have bytes
                    // as inputs, matching the prior MultipartFile getSize() > 0 filter.
                    if (part.getSubmittedFileName() != null && part.getSize() > 0) {
                        nonEmpty.add(part);
                    }
                }
            }
        } catch (IOException | jakarta.servlet.ServletException e) {
            callsShortCircuit.increment();
            return;
        }
        if (nonEmpty.isEmpty()) {
            callsShortCircuit.increment();
            return;
        }

        List<TempFile> tempFiles = new ArrayList<>(nonEmpty.size());
        List<JobInput> inputs = new ArrayList<>(nonEmpty.size());
        long totalInputBytes = 0L;
        try {
            for (Part mp : nonEmpty) {
                TempFile tf = tempFileManager.createManagedTempFile(".upload");
                tempFiles.add(tf);
                try (InputStream in = mp.getInputStream();
                        OutputStream out = Files.newOutputStream(tf.getPath())) {
                    in.transferTo(out);
                }
                inputs.add(buildJobInput(mp, tf.getPath()));
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
                        ProcessType.SINGLE_TOOL);

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

    /**
     * // TODO: Migration required - the {@link JobInput} record's first component is still Spring's
     * {@code MultipartFile} (owned by another module). This interceptor now sources inputs from the
     * servlet {@link Part} API. Once {@code JobInput} is migrated to carry a {@link Part} (or a
     * neutral size+content-type holder), construct it directly here: {@code return new
     * JobInput(part, path);}. Kept as a single adaptation seam so the rest of the charge flow is
     * untouched.
     */
    private JobInput buildJobInput(Part part, Path path) {
        return new JobInput(part, path);
    }

    // TODO: Migration required - was @Override AsyncHandlerInterceptor#afterCompletion(request,
    // response, handler, Exception). Convert to a JAX-RS ContainerResponseFilter.
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
            return;
        }

        recordOutputs(request, response, jobId);
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

    // TODO: Migration required - was @Override
    // AsyncHandlerInterceptor#afterConcurrentHandlingStarted. JAX-RS handles async dispatch
    // differently; no direct equivalent required.
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
     * // TODO: Migration required - resolves the resource {@link Method} the original code read
     * from Spring's {@code HandlerMethod} (via {@code hm.getMethodAnnotation(...)}). Until wired to
     * JAX-RS {@code ResourceInfo}, supports a handler that is already a {@link Method} or exposes a
     * no-arg {@code getMethod()} returning one, preserving the {@code @AutoJobPostMapping} gating.
     */
    private Method resolveResourceMethod(Object handler) {
        if (handler instanceof Method m) {
            return m;
        }
        if (handler == null) {
            return null;
        }
        try {
            Method getter = handler.getClass().getMethod("getMethod");
            Object result = getter.invoke(handler);
            if (result instanceof Method m) {
                return m;
            }
        } catch (ReflectiveOperationException ignored) {
            // Handler does not expose a resolvable resource method.
        }
        return null;
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
        Object pattern = request.getAttribute(BEST_MATCHING_PATTERN_ATTRIBUTE);
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
