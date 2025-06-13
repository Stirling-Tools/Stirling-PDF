package stirling.software.proprietary.audit;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.IntStream;

/**
 * Aspect for automatically auditing controller methods with web mappings
 * (GetMapping, PostMapping, etc.)
 */
@Aspect
@Component
@Slf4j
@RequiredArgsConstructor
public class ControllerAuditAspect {

    private final AuditService auditService;
    private final AuditConfigurationProperties auditConfig;

    /**
     * Intercept all methods with GetMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.GetMapping)")
    public Object auditGetMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditControllerMethod(joinPoint, "GET");
    }

    /**
     * Intercept all methods with PostMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.PostMapping)")
    public Object auditPostMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditControllerMethod(joinPoint, "POST");
    }

    /**
     * Intercept all methods with PutMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.PutMapping)")
    public Object auditPutMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditControllerMethod(joinPoint, "PUT");
    }

    /**
     * Intercept all methods with DeleteMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.DeleteMapping)")
    public Object auditDeleteMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditControllerMethod(joinPoint, "DELETE");
    }

    /**
     * Intercept all methods with PatchMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.PatchMapping)")
    public Object auditPatchMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditControllerMethod(joinPoint, "PATCH");
    }

    /**
     * Common method to audit controller methods
     */
    private Object auditControllerMethod(ProceedingJoinPoint joinPoint, String httpMethod) throws Throwable {
        // Skip if below STANDARD level (controller auditing is considered STANDARD level)
        if (!auditConfig.isLevelEnabled(AuditLevel.STANDARD)) {
            return joinPoint.proceed();
        }

        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        
        // Don't audit methods that already have @Audited annotation
        if (method.isAnnotationPresent(Audited.class)) {
            return joinPoint.proceed();
        }
        
        // Get the request path
        String path = getRequestPath(method, httpMethod);
        
        // Create audit data
        Map<String, Object> auditData = new HashMap<>();
        auditData.put("controller", joinPoint.getTarget().getClass().getSimpleName());
        auditData.put("method", method.getName());
        auditData.put("httpMethod", httpMethod);
        auditData.put("path", path);
        
        // Add method parameters if at VERBOSE level
        if (auditConfig.isLevelEnabled(AuditLevel.VERBOSE)) {
            Object[] args = joinPoint.getArgs();
            String[] parameterNames = signature.getParameterNames();
            
            if (args != null && parameterNames != null) {
                IntStream.range(0, args.length)
                        .forEach(i -> {
                            String paramName = i < parameterNames.length ? parameterNames[i] : "arg" + i;
                            auditData.put("arg_" + paramName, args[i]);
                        });
            }
        }
        
        Object result;
        try {
            // Execute the method
            result = joinPoint.proceed();
            
            // Add success status
            auditData.put("status", "success");
            
            // Add result if at VERBOSE level
            if (auditConfig.isLevelEnabled(AuditLevel.VERBOSE) && result != null) {
                auditData.put("resultType", result.getClass().getSimpleName());
            }
            
            return result;
        } catch (Throwable ex) {
            // Always add failure information
            auditData.put("status", "failure");
            auditData.put("errorType", ex.getClass().getName());
            auditData.put("errorMessage", ex.getMessage());
            
            // Re-throw the exception
            throw ex;
        } finally {
            // Determine the appropriate audit event type based on the controller package and class name
            AuditEventType eventType = determineAuditEventType(joinPoint.getTarget().getClass(), path, httpMethod);
            
            // Create the audit entry using the enum type
            auditService.audit(eventType, auditData, AuditLevel.STANDARD);
        }
    }
    
    /**
     * Determines the appropriate audit event type based on the controller's package and class name and HTTP method
     */
    private AuditEventType determineAuditEventType(Class<?> controllerClass, String path, String httpMethod) {
        String className = controllerClass.getSimpleName().toLowerCase();
        String packageName = controllerClass.getPackage().getName().toLowerCase();
        
        // For GET requests, just use HTTP_REQUEST as they don't process anything
        if (httpMethod.equals("GET")) {
            return AuditEventType.HTTP_REQUEST;
        }
        
        // For actual processing operations (POST, PUT, DELETE, etc.)
        
        // User/authentication related controllers
        if (className.contains("user") || className.contains("auth") || 
            packageName.contains("security") || packageName.contains("auth") ||
            path.startsWith("/user") || path.startsWith("/login") || 
            path.startsWith("/auth") || path.startsWith("/account")) {
            return AuditEventType.USER_PROFILE_UPDATE;
        }
        
        // Admin related controllers
        else if (className.contains("admin") || path.startsWith("/admin") || 
                path.startsWith("/settings") || className.contains("setting") ||
                className.contains("database") || path.contains("database")) {
            return AuditEventType.SETTINGS_CHANGED;
        }
        
        // File operations
        else if (className.contains("file") || path.contains("file")) {
            if (path.contains("upload") || path.contains("add")) {
                return AuditEventType.FILE_UPLOAD;
            } else if (path.contains("download")) {
                return AuditEventType.FILE_DOWNLOAD;
            } else {
                return AuditEventType.FILE_UPLOAD;
            }
        }
        
        // Default to PDF operations for most controllers
        else {
            return AuditEventType.PDF_PROCESS;
        }
    }
    
    /**
     * Extracts the request path from the method's annotations
     */
    private String getRequestPath(Method method, String httpMethod) {
        // Check class level RequestMapping
        String basePath = "";
        RequestMapping classMapping = method.getDeclaringClass().getAnnotation(RequestMapping.class);
        if (classMapping != null && classMapping.value().length > 0) {
            basePath = classMapping.value()[0];
        }
        
        // Check method level mapping
        String methodPath = "";
        Annotation annotation = null;
        
        switch (httpMethod) {
            case "GET":
                annotation = method.getAnnotation(GetMapping.class);
                if (annotation != null) {
                    String[] paths = ((GetMapping) annotation).value();
                    if (paths.length > 0) methodPath = paths[0];
                }
                break;
            case "POST":
                annotation = method.getAnnotation(PostMapping.class);
                if (annotation != null) {
                    String[] paths = ((PostMapping) annotation).value();
                    if (paths.length > 0) methodPath = paths[0];
                }
                break;
            case "PUT":
                annotation = method.getAnnotation(PutMapping.class);
                if (annotation != null) {
                    String[] paths = ((PutMapping) annotation).value();
                    if (paths.length > 0) methodPath = paths[0];
                }
                break;
            case "DELETE":
                annotation = method.getAnnotation(DeleteMapping.class);
                if (annotation != null) {
                    String[] paths = ((DeleteMapping) annotation).value();
                    if (paths.length > 0) methodPath = paths[0];
                }
                break;
            case "PATCH":
                annotation = method.getAnnotation(PatchMapping.class);
                if (annotation != null) {
                    String[] paths = ((PatchMapping) annotation).value();
                    if (paths.length > 0) methodPath = paths[0];
                }
                break;
        }
        
        // Combine base path and method path
        return basePath + methodPath;
    }
}