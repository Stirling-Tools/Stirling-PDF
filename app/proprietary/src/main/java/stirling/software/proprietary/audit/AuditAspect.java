package stirling.software.proprietary.audit;

import java.lang.reflect.Method;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
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
        if (!AuditUtils.shouldAudit(method, auditConfig)) {
            return joinPoint.proceed();
        }

        // Only create the map once we know we'll use it
        Map<String, Object> auditData =
                AuditUtils.createBaseAuditData(joinPoint, auditedAnnotation.level());

        // Add HTTP information if we're in a web context
        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs != null) {
            HttpServletRequest req = attrs.getRequest();
            String path = req.getRequestURI();
            String httpMethod = req.getMethod();
            AuditUtils.addHttpData(auditData, httpMethod, path, auditedAnnotation.level());
            AuditUtils.addFileData(auditData, joinPoint, auditedAnnotation.level());
        }

        // Add arguments if requested and if at VERBOSE level, or if specifically requested
        boolean includeArgs =
                auditedAnnotation.includeArgs()
                        && (auditedAnnotation.level() == AuditLevel.VERBOSE
                                || auditConfig.getAuditLevel() == AuditLevel.VERBOSE);

        if (includeArgs) {
            AuditUtils.addMethodArguments(auditData, joinPoint, AuditLevel.VERBOSE);
        }

        // Record start time for latency calculation
        long startTime = System.currentTimeMillis();
        Object result;
        try {
            // Execute the method
            result = joinPoint.proceed();

            // Add success status
            auditData.put("status", "success");

            // Add result if requested and if at VERBOSE level
            boolean includeResult =
                    auditedAnnotation.includeResult()
                            && (auditedAnnotation.level() == AuditLevel.VERBOSE
                                    || auditConfig.getAuditLevel() == AuditLevel.VERBOSE);

            if (includeResult && result != null) {
                // Use safe string conversion with size limiting
                auditData.put("result", AuditUtils.safeToString(result, 1000));
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
            AuditUtils.addTimingData(
                    auditData, startTime, resp, auditedAnnotation.level(), isHttpRequest);

            // Resolve the event type based on annotation and context
            String httpMethod = null;
            String path = null;
            if (attrs != null) {
                HttpServletRequest req = attrs.getRequest();
                httpMethod = req.getMethod();
                path = req.getRequestURI();
            }

            AuditEventType eventType =
                    AuditUtils.resolveEventType(
                            method,
                            joinPoint.getTarget().getClass(),
                            path,
                            httpMethod,
                            auditedAnnotation);

            // Check if we should use string type instead
            String typeString = auditedAnnotation.typeString();
            if (eventType == AuditEventType.HTTP_REQUEST && StringUtils.isNotEmpty(typeString)) {
                // Use the string type (for backward compatibility)
                auditService.audit(typeString, auditData, auditedAnnotation.level());
            } else {
                // Use the enum type (preferred)
                auditService.audit(eventType, auditData, auditedAnnotation.level());
            }
        }
    }
}
