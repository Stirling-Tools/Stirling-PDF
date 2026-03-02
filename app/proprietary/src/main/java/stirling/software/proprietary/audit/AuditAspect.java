package stirling.software.proprietary.audit;

import java.lang.reflect.Method;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

/** Aspect for processing {@link Audited} annotations. */
@Aspect
@Component
@Slf4j
@RequiredArgsConstructor
@org.springframework.core.annotation.Order(
        10) // Lower precedence (higher number) - executes after AutoJobAspect
public class AuditAspect {

    private final AuditService auditService;
    private final AuditConfigurationProperties auditConfig;

    @Around("@annotation(stirling.software.proprietary.audit.Audited)")
    public Object auditMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        Audited auditedAnnotation = method.getAnnotation(Audited.class);

        // Fast path: use unified check to determine if we should audit
        // This avoids all data collection if auditing is disabled
        if (!auditService.shouldAudit(method, auditConfig)) {
            return joinPoint.proceed();
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

        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest req = attrs != null ? attrs.getRequest() : null;

        String capturedIp = MDC.get("auditIp");
        if (capturedIp == null) {
            // Fallback: Try to extract from request if available
            capturedIp = auditService.extractClientIp(req);
        }

        // Only create the map once we know we'll use it
        Map<String, Object> auditData =
                auditService.createBaseAuditData(joinPoint, auditedAnnotation.level());

        // Add HTTP information if we're in a web context
        if (attrs != null) {
            String path = req.getRequestURI();
            String httpMethod = req.getMethod();
            auditService.addHttpData(auditData, httpMethod, path, auditedAnnotation.level());
            auditService.addFileData(auditData, joinPoint, auditedAnnotation.level());

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
            auditService.addMethodArguments(auditData, joinPoint, auditedAnnotation.level());
        }

        // Record start time for latency calculation
        long startTime = System.currentTimeMillis();
        Object result;
        try {
            // Execute the method
            result = joinPoint.proceed();

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
        } catch (Throwable ex) {
            // Always add failure information regardless of level
            auditData.put("status", "failure");
            auditData.put("errorType", ex.getClass().getName());
            auditData.put("errorMessage", ex.getMessage());

            // Re-throw the exception
            throw ex;
        } finally {
            // Add timing information - use isHttpRequest=false to ensure we get timing for non-HTTP
            // methods
            HttpServletResponse resp = attrs != null ? attrs.getResponse() : null;
            boolean isHttpRequest = attrs != null;
            auditService.addTimingData(
                    auditData, startTime, resp, auditedAnnotation.level(), isHttpRequest);

            // Resolve the event type based on annotation and context
            String httpMethod = null;
            String path = null;
            if (attrs != null) {
                httpMethod = req.getMethod();
                path = req.getRequestURI();
            }

            AuditEventType eventType =
                    auditService.resolveEventType(
                            method,
                            joinPoint.getTarget().getClass(),
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
