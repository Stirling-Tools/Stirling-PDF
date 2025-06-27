package stirling.software.proprietary.audit;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

/**
 * Aspect for automatically auditing controller methods with web mappings (GetMapping, PostMapping,
 * etc.)
 */
@Aspect
@Component
@Slf4j
@RequiredArgsConstructor
@org.springframework.core.annotation.Order(
        10) // Lower precedence (higher number) - executes after AutoJobAspect
public class ControllerAuditAspect {

    private final AuditService auditService;
    private final AuditConfigurationProperties auditConfig;

    @Around(
            "execution(* org.springframework.web.servlet.resource.ResourceHttpRequestHandler.handleRequest(..))")
    public Object auditStaticResource(ProceedingJoinPoint jp) throws Throwable {
        return auditController(jp, "GET");
    }

    /** Intercept all methods with GetMapping annotation */
    @Around("@annotation(org.springframework.web.bind.annotation.GetMapping)")
    public Object auditGetMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "GET");
    }

    /** Intercept all methods with PostMapping annotation */
    @Around("@annotation(org.springframework.web.bind.annotation.PostMapping)")
    public Object auditPostMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "POST");
    }

    /** Intercept all methods with PutMapping annotation */
    @Around("@annotation(org.springframework.web.bind.annotation.PutMapping)")
    public Object auditPutMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "PUT");
    }

    /** Intercept all methods with DeleteMapping annotation */
    @Around("@annotation(org.springframework.web.bind.annotation.DeleteMapping)")
    public Object auditDeleteMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "DELETE");
    }

    /** Intercept all methods with PatchMapping annotation */
    @Around("@annotation(org.springframework.web.bind.annotation.PatchMapping)")
    public Object auditPatchMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "PATCH");
    }

    /** Intercept all methods with AutoJobPostMapping annotation */
    @Around("@annotation(stirling.software.common.annotations.AutoJobPostMapping)")
    public Object auditAutoJobMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "POST");
    }

    private Object auditController(ProceedingJoinPoint joinPoint, String httpMethod)
            throws Throwable {
        MethodSignature sig = (MethodSignature) joinPoint.getSignature();
        Method method = sig.getMethod();

        // Fast path: check if auditing is enabled before doing any work
        // This avoids all data collection if auditing is disabled
        if (!AuditUtils.shouldAudit(method, auditConfig)) {
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
            HttpServletRequest maybe = AuditUtils.getCurrentRequest();
            if (maybe != null && AuditUtils.isStaticResourceRequest(maybe)) {
                return joinPoint.proceed();
            }
        }

        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest req = attrs != null ? attrs.getRequest() : null;
        HttpServletResponse resp = attrs != null ? attrs.getResponse() : null;

        long start = System.currentTimeMillis();

        // Use AuditUtils to create the base audit data
        Map<String, Object> data = AuditUtils.createBaseAuditData(joinPoint, level);

        // Add HTTP-specific information
        AuditUtils.addHttpData(data, httpMethod, path, level);

        // Add file information if present
        AuditUtils.addFileData(data, joinPoint, level);

        // Add method arguments if at VERBOSE level
        if (level.includes(AuditLevel.VERBOSE)) {
            AuditUtils.addMethodArguments(data, joinPoint, level);
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

            // Call AuditUtils but with isHttpRequest=true to skip additional timing
            AuditUtils.addTimingData(data, start, resp, level, true);

            // Add result for VERBOSE level
            if (level.includes(AuditLevel.VERBOSE) && result != null) {
                // Use safe string conversion with size limiting
                data.put("result", AuditUtils.safeToString(result, 1000));
            }

            // Resolve the event type using the unified method
            AuditEventType eventType =
                    AuditUtils.resolveEventType(
                            method,
                            joinPoint.getTarget().getClass(),
                            path,
                            httpMethod,
                            auditedAnnotation);

            // Check if we should use string type instead (for backward compatibility)
            if (auditedAnnotation != null) {
                String typeString = auditedAnnotation.typeString();
                if (eventType == AuditEventType.HTTP_REQUEST
                        && StringUtils.isNotEmpty(typeString)) {
                    auditService.audit(typeString, data, level);
                    return result;
                }
            }

            // Use the enum type
            auditService.audit(eventType, data, level);
        }
        return result;
    }

    // Using AuditUtils.determineAuditEventType instead

    private String getRequestPath(Method method, String httpMethod) {
        String base = "";
        RequestMapping cm = method.getDeclaringClass().getAnnotation(RequestMapping.class);
        if (cm != null && cm.value().length > 0) base = cm.value()[0];
        String mp = "";
        Annotation ann =
                switch (httpMethod) {
                    case "GET" -> method.getAnnotation(GetMapping.class);
                    case "POST" -> method.getAnnotation(PostMapping.class);
                    case "PUT" -> method.getAnnotation(PutMapping.class);
                    case "DELETE" -> method.getAnnotation(DeleteMapping.class);
                    case "PATCH" -> method.getAnnotation(PatchMapping.class);
                    default -> null;
                };
        if (ann instanceof GetMapping gm && gm.value().length > 0) mp = gm.value()[0];
        if (ann instanceof PostMapping pm && pm.value().length > 0) mp = pm.value()[0];
        if (ann instanceof PutMapping pum && pum.value().length > 0) mp = pum.value()[0];
        if (ann instanceof DeleteMapping dm && dm.value().length > 0) mp = dm.value()[0];
        if (ann instanceof PatchMapping pam && pam.value().length > 0) mp = pam.value()[0];
        return base + mp;
    }

    // Using AuditUtils.getCurrentRequest instead
}
