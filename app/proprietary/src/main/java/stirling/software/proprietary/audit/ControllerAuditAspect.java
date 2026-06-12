package stirling.software.proprietary.audit;

import java.lang.annotation.Annotation;
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
 * Spring's {@code ResourceHttpRequestHandler}. {@code @Around}/{@code ProceedingJoinPoint} +
 * {@code MethodSignature} became {@code @AroundInvoke}/{@link InvocationContext}, and
 * {@code RequestContextHolder}/{@code ServletRequestAttributes} were replaced by an injected
 * {@link HttpServletRequest}/{@link HttpServletResponse} (provided by quarkus-undertow). The Spring
 * {@code @Order(0)} (highest precedence, runs before {@code AutoJobAspect}) maps to
 * {@code @Priority} with a value lower than {@code AutoJobAspect}'s {@code @Priority(20)} so this
 * interceptor still populates MDC first.
 *
 * <p>TODO: Migration required - CDI interceptors are bound by an {@code @InterceptorBinding}
 * annotation declared on the target class/method; there is NO CDI equivalent for AspectJ's broad,
 * expression-based pointcuts. The original advices fired for every Spring-MVC mapping annotation and
 * for the static-resource handler, none of which exist on JAX-RS controllers. To retain
 * "audit every HTTP endpoint" behaviour in Quarkus, do ONE of:
 * <ul>
 *   <li>register a JAX-RS {@code @Provider} pair of
 *       {@code ContainerRequestFilter}/{@code ContainerResponseFilter} (or RESTEasy Reactive
 *       {@code @ServerRequestFilter}/{@code @ServerResponseFilter}) that calls this same
 *       {@code AuditService} logic around every resource method (preferred - covers all endpoints
 *       without per-method annotations); OR
 *   <li>introduce an explicit {@code @InterceptorBinding} (e.g. {@code @AuditedHttp}) and stamp it on
 *       the controller classes/methods that should be audited, then bind this interceptor with it.
 * </ul>
 * As an interim binding this interceptor is bound by the existing {@link AutoJobPostMapping}
 * {@code @InterceptorBinding} (one of the six original pointcuts) so the class is valid CDI and
 * still audits auto-job POST endpoints. <b>This does NOT cover plain GET/POST/PUT/DELETE/PATCH or
 * static-resource requests</b> the way the Spring aspect did - that requires the JAX-RS filter or
 * dedicated binding described above. NOTE: it must NOT be bound to {@link Audited}, because the body
 * deliberately skips {@code @Audited} methods (those are handled by {@code AuditAspect}).
 * The {@code auditController(...)} body below is preserved verbatim; the static-resource and
 * static-GET-skip handling (originally driven by the {@code ResourceHttpRequestHandler} pointcut)
 * still works via {@link AuditService#isStaticResourceRequest(HttpServletRequest)}.
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

    /**
     * TODO: Migration required - this single {@code @AroundInvoke} replaces the five Spring
     * {@code @Around} advices (GET/POST/PUT/DELETE/PATCH + AutoJobPostMapping) and the
     * static-resource {@code execution(...)} advice. Because CDI cannot inspect Spring/JAX-RS mapping
     * annotations to derive the HTTP verb at bind time, the verb is resolved from the live request
     * ({@link HttpServletRequest#getMethod()}); if the request is unavailable (non-web invocation) it
     * falls back to POST to mirror the most common audited mapping.
     */
    @AroundInvoke
    public Object auditEndpoint(InvocationContext ctx) throws Throwable {
        String httpMethod = request != null ? request.getMethod() : "POST";
        return auditController(ctx, httpMethod != null ? httpMethod : "POST");
    }

    private Object auditController(InvocationContext joinPoint, String httpMethod) throws Throwable {
        Method method = joinPoint.getMethod();

        // Fast path: check if auditing is enabled before doing any work
        // This avoids all data collection if auditing is disabled
        if (!auditService.shouldAudit(method, auditConfig)) {
            return joinPoint.proceed();
        }

        // Check if method is explicitly annotated with @Audited
        Audited auditedAnnotation = method.getAnnotation(Audited.class);
        AuditLevel level = auditConfig.getAuditLevel();

        // If @Audited annotation is present, respect its level setting
        if (auditedAnnotation != null) {
            // Use the level from annotation if it's stricter than global level
            level = auditedAnnotation.level();
        }

        String path = getRequestPath(method, httpMethod);

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

        HttpServletRequest req = request;
        HttpServletResponse resp = response;

        String previousPrincipal = MDC.get("auditPrincipal");
        String previousOrigin = MDC.get("auditOrigin");
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

            long start = System.currentTimeMillis();

            // TODO: Migration required (collaborator) - AuditService.createBaseAuditData/addFileData/
            // addMethodArguments/resolveEventType still take org.aspectj.lang.ProceedingJoinPoint
            // (AuditService is not yet migrated). Once AuditService is converted, change those
            // signatures to accept jakarta.interceptor.InvocationContext (getMethod/getParameters/
            // getTarget cover the data used). These calls pass the InvocationContext and will only
            // typecheck after that collaborator change.
            // Use auditService to create the base audit data
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

                // Resolve the event type using the unified method
                AuditEventType eventType =
                        auditService.resolveEventType(
                                method,
                                joinPoint.getTarget().getClass(),
                                path,
                                httpMethod,
                                auditedAnnotation);

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
            restoreMdcValue("auditIp", previousIp);
        }
    }

    // Using AuditUtils.determineAuditEventType instead

    private String getRequestPath(Method method, String httpMethod) {
        // Prefer actual request URI over annotation patterns (which may contain regex)
        if (request != null) {
            return request.getRequestURI();
        }

        // Fallback: reconstruct from annotations when not in web context.
        // TODO: Migration required - the Spring @RequestMapping/@GetMapping/... fallback below relies
        // on Spring MVC mapping annotations that no longer exist on JAX-RS controllers. Once the
        // controllers are on JAX-RS, switch this fallback to read jakarta.ws.rs.@Path / @GET / @POST
        // etc. (or drop it entirely if the request URI is always available). The original Spring
        // reconstruction is preserved verbatim until then.
        String base = "";
        org.springframework.web.bind.annotation.RequestMapping cm =
                method.getDeclaringClass()
                        .getAnnotation(org.springframework.web.bind.annotation.RequestMapping.class);
        if (cm != null && cm.value().length > 0) base = cm.value()[0];
        String mp = "";
        Annotation ann =
                switch (httpMethod) {
                    case "GET" ->
                            method.getAnnotation(
                                    org.springframework.web.bind.annotation.GetMapping.class);
                    case "POST" ->
                            method.getAnnotation(
                                    org.springframework.web.bind.annotation.PostMapping.class);
                    case "PUT" ->
                            method.getAnnotation(
                                    org.springframework.web.bind.annotation.PutMapping.class);
                    case "DELETE" ->
                            method.getAnnotation(
                                    org.springframework.web.bind.annotation.DeleteMapping.class);
                    case "PATCH" ->
                            method.getAnnotation(
                                    org.springframework.web.bind.annotation.PatchMapping.class);
                    default -> null;
                };
        if (ann instanceof org.springframework.web.bind.annotation.GetMapping gm
                && gm.value().length > 0) mp = gm.value()[0];
        if (ann instanceof org.springframework.web.bind.annotation.PostMapping pm
                && pm.value().length > 0) mp = pm.value()[0];
        if (ann instanceof org.springframework.web.bind.annotation.PutMapping pum
                && pum.value().length > 0) mp = pum.value()[0];
        if (ann instanceof org.springframework.web.bind.annotation.DeleteMapping dm
                && dm.value().length > 0) mp = dm.value()[0];
        if (ann instanceof org.springframework.web.bind.annotation.PatchMapping pam
                && pam.value().length > 0) mp = pam.value()[0];
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
