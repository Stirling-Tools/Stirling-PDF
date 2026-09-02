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

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

/**
 * Interceptor for automatically auditing controller methods with web mappings.
 *
 * <p>MIGRATION (Spring AOP -&gt; CDI interceptor): was an {@code @Aspect}/{@code @Component} with
 * multiple {@code @Around} advices whose pointcuts matched <em>any</em> method annotated with
 * Spring's {@code @GetMapping}/{@code @PostMapping}/{@code @PutMapping}/{@code @DeleteMapping}/
 * {@code @PatchMapping}/{@code @AutoJobPostMapping}, plus an {@code execution(...)} expression on
 * Spring's {@code ResourceHttpRequestHandler}. {@code @Around}/{@code ProceedingJoinPoint} + {@code
 * MethodSignature} became {@code @AroundInvoke}/{@link InvocationContext}, and {@code
 * RequestContextHolder}/{@code ServletRequestAttributes} were replaced by an injected {@link
 * HttpServletRequest}/{@link HttpServletResponse} (provided by quarkus-undertow). The Spring
 * {@code @Order(0)} (highest precedence, runs before {@code AutoJobAspect}) maps to
 * {@code @Priority} with a value lower than {@code AutoJobAspect}'s {@code @Priority(20)} so this
 * interceptor still populates MDC first.
 */
@Interceptor
@AutoJobPostMapping
@Priority(0) // Highest precedence - runs BEFORE AutoJobAspect (@Priority(20)) to populate MDC
@Slf4j
public class ControllerAuditAspect {

    private final AuditService auditService;
    private final AuditConfigurationProperties auditConfig;
    private final HttpServletRequest request;
    private final HttpServletResponse response;

    @Inject
    public ControllerAuditAspect(
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
    public Object auditEndpoint(InvocationContext ctx) throws Throwable {
        // Reactive-safe: the injected HttpServletRequest proxy is never null but throws UT000048
        // ("No request is currently active") when touched on a RESTEasy Reactive worker thread.
        // Resolve the verb through the guarded AuditService.getCurrentRequest() (returns null off a
        // servlet request) and fall back to POST, mirroring the original non-web behaviour.
        HttpServletRequest current = auditService.getCurrentRequest();
        String httpMethod = current != null ? current.getMethod() : "POST";
        return auditController(ctx, httpMethod != null ? httpMethod : "POST");
    }

    // Reactive-safe accessor for the response proxy: touching it off an active servlet request
    // throws UT000048, so treat that (and an unsatisfied proxy) as "no response available".
    private HttpServletResponse safeResponse() {
        try {
            if (response == null) {
                return null;
            }
            response.getStatus();
            return response;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private Object auditController(InvocationContext joinPoint, String httpMethod)
            throws Throwable {
        Method method = joinPoint.getMethod();

        // Resolve the event type up front so the enterprise gate can be type-aware: document
        // processing events (the Documents tab's data source) are audited without an Enterprise
        // license, while the rest of the audit log stays Enterprise-only. resolveEventType is cheap
        // (annotation / class / path checks), so it's safe on the pre-record fast path.
        Audited auditedAnnotation = method.getAnnotation(Audited.class);
        String path = getRequestPath(method, httpMethod);
        AuditEventType eventType =
                auditService.resolveEventType(
                        method,
                        joinPoint.getTarget().getClass(),
                        path,
                        httpMethod,
                        auditedAnnotation);

        // Fast path: skip all data collection when this event won't be recorded.
        if (!auditService.shouldAudit(eventType, method, auditConfig)) {
            return joinPoint.proceed();
        }

        AuditLevel level = auditConfig.getAuditLevel();
        // If @Audited annotation is present, respect its level setting
        if (auditedAnnotation != null) {
            // Use the level from annotation if it's stricter than global level
            level = auditedAnnotation.level();
        }

        // Skip static GET resources
        if ("GET".equals(httpMethod)) {
            HttpServletRequest maybe = auditService.getCurrentRequest();
            if (maybe != null && auditService.isStaticResourceRequest(maybe)) {
                return joinPoint.proceed();
            }
            // Skip polling calls at STANDARD level (exclude from audit log noise)
            if (maybe != null
                    && auditService.isPollingCall(maybe)
                    && auditConfig.getAuditLevel() == AuditLevel.STANDARD) {
                return joinPoint.proceed();
            }
        }

        HttpServletRequest req = auditService.getCurrentRequest();
        HttpServletResponse resp = safeResponse();

        String previousPrincipal = MDC.get("auditPrincipal");
        String previousOrigin = MDC.get("auditOrigin");
        String previousSource = MDC.get("auditSource");
        String previousIp = MDC.get("auditIp");

        // EARLY CAPTURE: Capture from SecurityContext on request thread, store in MDC for async
        // propagation
        // MDC.put is necessary for background threads to inherit audit context
        String capturedPrincipal = previousPrincipal;
        if (capturedPrincipal == null) {
            capturedPrincipal = auditService.captureCurrentPrincipal();
            MDC.put("auditPrincipal", capturedPrincipal);
        }

        String capturedOrigin = previousOrigin;
        if (capturedOrigin == null) {
            capturedOrigin = auditService.captureCurrentOrigin();
            MDC.put("auditOrigin", capturedOrigin);
        }

        String capturedIp = previousIp;
        if (capturedIp == null && req != null) {
            capturedIp = auditService.extractClientIp(req);
            if (capturedIp != null) {
                MDC.put("auditIp", capturedIp);
            }
        }
        try {
            // Avoid duplicate events for controller methods explicitly annotated with @Audited.
            // @Audited methods are audited by AuditAspect.
            if (auditedAnnotation != null) {
                return joinPoint.proceed();
            }

            // Stamp the free-UI source only for non-@Audited controller traffic — an actual
            // tool / UI action. @Audited events (login, settings) return above without a source,
            // so they never count as an "active editor" or a free UI run. The finally block
            // restores auditSource, so a pooled thread can't leak a stale "WEB" into them.
            if (previousSource == null) {
                MDC.put("auditSource", auditService.captureCurrentSource());
            }

            long start = System.currentTimeMillis();

            Map<String, Object> data = auditService.createBaseAuditData(joinPoint, level);

            // Add HTTP-specific information
            auditService.addHttpData(data, httpMethod, path, level);

            // Add file information if present
            auditService.addFileData(data, joinPoint, level);

            // Add method arguments if at VERBOSE level
            if (level.includes(AuditLevel.VERBOSE)) {
                auditService.addMethodArguments(data, joinPoint, level);
            }

            Object result = null;
            try {
                result = joinPoint.proceed();
                data.put("outcome", "success");
            } catch (Throwable ex) {
                data.put("outcome", "failure");
                data.put("errorType", ex.getClass().getSimpleName());
                data.put("errorMessage", ex.getMessage());
                throw ex;
            } finally {
                // Handle timing directly for HTTP requests
                if (level.includes(AuditLevel.STANDARD)) {
                    data.put("latencyMs", System.currentTimeMillis() - start);
                    if (resp != null) data.put("statusCode", resp.getStatus());
                }

                // Call auditService but with isHttpRequest=true to skip additional timing
                auditService.addTimingData(data, start, resp, level, true);

                // Merge controller-set policy context + the internal-automation marker (set after
                // the body ran, so it must happen here rather than with the pre-proceed HTTP data).
                auditService.addAutomationContext(data, req);

                // Add result only if operation result capture is explicitly enabled
                // Skip result for UI_DATA events to avoid storing large response bodies
                if (auditService.shouldCaptureOperationResults()
                        && result != null
                        && eventType != AuditEventType.UI_DATA) {
                    // Use safe string conversion with size limiting
                    data.put("result", auditService.safeToString(result, 1000));
                }

                // Check if we should use string type instead (for backward compatibility)
                if (auditedAnnotation != null) {
                    String typeString = auditedAnnotation.typeString();
                    if (eventType == AuditEventType.HTTP_REQUEST
                            && StringUtils.isNotEmpty(typeString)) {
                        auditService.audit(
                                capturedPrincipal,
                                capturedOrigin,
                                capturedIp,
                                typeString,
                                data,
                                level);
                    } else {
                        // Use the enum type with early-captured values
                        auditService.audit(
                                capturedPrincipal,
                                capturedOrigin,
                                capturedIp,
                                eventType,
                                data,
                                level);
                    }
                } else {
                    // Use the enum type with early-captured values
                    auditService.audit(
                            capturedPrincipal, capturedOrigin, capturedIp, eventType, data, level);
                }
            }

            return result;
        } finally {
            restoreMdcValue("auditPrincipal", previousPrincipal);
            restoreMdcValue("auditOrigin", previousOrigin);
            restoreMdcValue("auditSource", previousSource);
            restoreMdcValue("auditIp", previousIp);
        }
    }

    // Using AuditUtils.determineAuditEventType instead

    private String getRequestPath(Method method, String httpMethod) {
        // Prefer actual request URI over annotation patterns (which may contain regex).
        // Reactive-safe: go through the guarded accessor (the raw proxy throws UT000048
        // off-thread).
        HttpServletRequest current = auditService.getCurrentRequest();
        if (current != null) {
            return current.getRequestURI();
        }
        // Fallback: try JAX-RS @Path annotation on method/class; return empty string if not present
        jakarta.ws.rs.Path classPath =
                method.getDeclaringClass().getAnnotation(jakarta.ws.rs.Path.class);
        jakarta.ws.rs.Path methodPath = method.getAnnotation(jakarta.ws.rs.Path.class);
        String base = (classPath != null) ? classPath.value() : "";
        String mp = (methodPath != null) ? methodPath.value() : "";
        return base + mp;
    }

    private void restoreMdcValue(String key, String previousValue) {
        if (previousValue != null) {
            MDC.put(key, previousValue);
        } else {
            MDC.remove(key);
        }
    }

    // Using AuditUtils.getCurrentRequest instead
}
