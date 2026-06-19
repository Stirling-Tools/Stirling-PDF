package stirling.software.proprietary.audit;

import java.lang.reflect.Method;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.MDC;

import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.interceptor.AroundInvoke;
import jakarta.interceptor.Interceptor;
import jakarta.interceptor.InvocationContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

/**
 * Interceptor for processing {@link Audited} annotations.
 *
 * <p>MIGRATION (Spring AOP -> CDI interceptor): was an {@code @Aspect} {@code @Component} with
 * {@code @Around("@annotation(...Audited)")} advice. Reworked into a CDI {@link Interceptor} bound
 * by the {@code @Audited} annotation; {@code @Around}/{@code ProceedingJoinPoint} became
 * {@code @AroundInvoke}/{@link InvocationContext}. Spring's {@code @Order(10)} (lower precedence,
 * runs after {@code AutoJobAspect}) maps to {@code @Priority}: {@code AutoJobAspect} uses
 * {@code @Priority(20)}, so this audit interceptor uses {@code @Priority(10)} which runs FIRST and
 * populates MDC before the job interceptor - matching the original ordering intent (audit captures
 * principal/origin/IP on the request thread before the job is dispatched).
 *
 * <p>TODO: Migration required - the {@code @Audited} annotation ({@code
 * stirling.software.proprietary.audit.Audited}) must be made a CDI
 * {@code @jakarta.interceptor.InterceptorBinding} (and its members marked
 * {@code @jakarta.enterprise.util.Nonbinding}) for this {@code @Interceptor} to bind to it; see the
 * already-migrated {@code AutoJobPostMapping}. That is a separate file and is intentionally left
 * untouched here.
 *
 * <p>TODO: Migration required - {@code AuditService}'s helper methods ({@code createBaseAuditData},
 * {@code addFileData}, {@code addMethodArguments}, {@code resolveEventType}) currently accept an
 * AspectJ {@code ProceedingJoinPoint} / {@code joinPoint.getTarget()} / {@code
 * joinPoint.getArgs()}. They must be migrated to accept a CDI {@link InvocationContext} (use {@code
 * ctx.getTarget()}, {@code ctx.getParameters()}, {@code ctx.getMethod()}). The call sites below
 * pass {@code ctx} on that assumption.
 */
@Interceptor
@Audited
@Priority(10)
@Slf4j
public class AuditAspect {

    private final AuditService auditService;
    private final AuditConfigurationProperties auditConfig;
    private final HttpServletRequest request;
    private final HttpServletResponse response;

    @Inject
    public AuditAspect(
            AuditService auditService,
            AuditConfigurationProperties auditConfig,
            HttpServletRequest request,
            HttpServletResponse response) {
        this.auditService = auditService;
        this.auditConfig = auditConfig;
        this.request = request;
        this.response = response;
    }

    @AroundInvoke
    public Object auditMethod(InvocationContext ctx) throws Exception {
        Method method = ctx.getMethod();
        Audited auditedAnnotation = method.getAnnotation(Audited.class);

        // Fast path: use unified check to determine if we should audit
        // This avoids all data collection if auditing is disabled
        if (!auditService.shouldAudit(method, auditConfig)) {
            return ctx.proceed();
        }

        // EARLY CAPTURE: Try to get from MDC first (propagated from background threads)
        // If not found, capture from SecurityContext on request thread
        String capturedPrincipal = MDC.get("auditPrincipal");
        if (capturedPrincipal == null) {
            // Fallback: Capture from SecurityContext if running in request thread
            capturedPrincipal = auditService.captureCurrentPrincipal();
        }

        String capturedOrigin = MDC.get("auditOrigin");
        if (capturedOrigin == null) {
            // Fallback: Capture from SecurityContext if running in request thread
            capturedOrigin = auditService.captureCurrentOrigin();
        }

        // MIGRATION: Spring's RequestContextHolder/ServletRequestAttributes -> CDI-injected
        // jakarta HttpServletRequest/HttpServletResponse (quarkus-undertow). When invoked outside
        // an
        // HTTP request scope the injected proxy resolves to null, so we treat a null request the
        // same way the original treated a null ServletRequestAttributes.
        // Reactive-safe: the injected proxy is non-null but throws UT000048 when touched off an
        // active servlet request (RESTEasy Reactive worker threads). Resolve via the guarded
        // AuditService.getCurrentRequest(), which returns null outside a live servlet request.
        HttpServletRequest req = auditService.getCurrentRequest();
        boolean isHttpRequest = req != null;

        String capturedIp = MDC.get("auditIp");
        if (capturedIp == null) {
            // Fallback: Try to extract from request if available
            capturedIp = auditService.extractClientIp(req);
        }

        // Only create the map once we know we'll use it
        // TODO: Migration required - createBaseAuditData must accept InvocationContext (ctx) once
        // AuditService is migrated off ProceedingJoinPoint.
        Map<String, Object> auditData =
                auditService.createBaseAuditData(ctx, auditedAnnotation.level());

        // Add HTTP information if we're in a web context
        if (isHttpRequest) {
            String path = req.getRequestURI();
            String httpMethod = req.getMethod();
            auditService.addHttpData(auditData, httpMethod, path, auditedAnnotation.level());
            // TODO: Migration required - addFileData must accept InvocationContext (ctx).
            auditService.addFileData(auditData, ctx, auditedAnnotation.level());

            // File operation details logged at DEBUG level for verification
            if (auditData.containsKey("files") || auditData.containsKey("filename")) {
                log.debug(
                        "@Audited method file operation - Principal: {}, Origin: {}, IP: {}, Method: {}, Path: {}, Files: {}",
                        capturedPrincipal,
                        capturedOrigin,
                        capturedIp,
                        httpMethod,
                        path,
                        auditData.getOrDefault("files", auditData.getOrDefault("filename", "N/A")));
            }
            if (auditData.containsKey("fileHash") || auditData.containsKey("hash")) {
                log.debug(
                        "@Audited file hash captured - Hash: {}, Document: {}",
                        auditData.getOrDefault("fileHash", auditData.getOrDefault("hash", "N/A")),
                        auditData.getOrDefault("filename", "N/A"));
            }
        }

        // Add method arguments if requested (captured at all audit levels for operational context)
        if (auditedAnnotation.includeArgs()) {
            // TODO: Migration required - addMethodArguments must accept InvocationContext (ctx).
            auditService.addMethodArguments(auditData, ctx, auditedAnnotation.level());
        }

        // Record start time for latency calculation
        long startTime = System.currentTimeMillis();
        Object result;
        try {
            // Execute the method
            result = ctx.proceed();

            // Add success status
            auditData.put("status", "success");

            // Add result only if requested in annotation AND operation result capture is enabled
            boolean includeResult =
                    auditedAnnotation.includeResult()
                            && auditService.shouldCaptureOperationResults();

            if (includeResult && result != null) {
                // Use safe string conversion with size limiting
                auditData.put("result", auditService.safeToString(result, 1000));
            }

            return result;
        } catch (Exception ex) {
            // Always add failure information regardless of level
            auditData.put("status", "failure");
            auditData.put("errorType", ex.getClass().getName());
            auditData.put("errorMessage", ex.getMessage());

            // Re-throw the exception
            throw ex;
        } finally {
            // Add timing information - use isHttpRequest=false to ensure we get timing for non-HTTP
            // methods
            HttpServletResponse resp = isHttpRequest ? response : null;
            auditService.addTimingData(
                    auditData, startTime, resp, auditedAnnotation.level(), isHttpRequest);

            // Resolve the event type based on annotation and context
            String httpMethod = null;
            String path = null;
            if (isHttpRequest) {
                httpMethod = req.getMethod();
                path = req.getRequestURI();
            }

            // TODO: Migration required - resolveEventType reads joinPoint.getTarget(); once
            // AuditService is migrated it should use ctx.getTarget().getClass() instead.
            AuditEventType eventType =
                    auditService.resolveEventType(
                            method,
                            ctx.getTarget().getClass(),
                            path,
                            httpMethod,
                            auditedAnnotation);

            // Check if we should use string type instead
            String typeString = auditedAnnotation.typeString();
            if (eventType == AuditEventType.HTTP_REQUEST && StringUtils.isNotEmpty(typeString)) {
                // Use the string type with early-captured values
                auditService.audit(
                        capturedPrincipal,
                        capturedOrigin,
                        capturedIp,
                        typeString,
                        auditData,
                        auditedAnnotation.level());
            } else {
                // Use the enum type with early-captured values
                auditService.audit(
                        capturedPrincipal,
                        capturedOrigin,
                        capturedIp,
                        eventType,
                        auditData,
                        auditedAnnotation.level());
            }
        }
    }
}
