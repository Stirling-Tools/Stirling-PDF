package stirling.software.proprietary.audit;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.IntStream;

/**
 * Aspect for processing {@link Audited} annotations.
 */
@Aspect
@Component
@Slf4j
@RequiredArgsConstructor
public class AuditAspect {

    private final AuditService auditService;
    private final AuditConfigurationProperties auditConfig;

    @Around("@annotation(stirling.software.proprietary.audit.Audited)")
    public Object auditMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        Audited auditedAnnotation = method.getAnnotation(Audited.class);
        
        // Skip if this audit level is not enabled
        if (!auditConfig.isLevelEnabled(auditedAnnotation.level())) {
            return joinPoint.proceed();
        }
        
        Map<String, Object> auditData = new HashMap<>();
        auditData.put("className", joinPoint.getTarget().getClass().getName());
        auditData.put("methodName", method.getName());
        
        // Add arguments if requested and if at VERBOSE level, or if specifically requested
        boolean includeArgs = auditedAnnotation.includeArgs() && 
                             (auditedAnnotation.level() == AuditLevel.VERBOSE || 
                              auditConfig.getAuditLevel() == AuditLevel.VERBOSE);
                              
        if (includeArgs) {
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
            
            // Add result if requested and if at VERBOSE level
            boolean includeResult = auditedAnnotation.includeResult() && 
                                  (auditedAnnotation.level() == AuditLevel.VERBOSE || 
                                   auditConfig.getAuditLevel() == AuditLevel.VERBOSE);
                                   
            if (includeResult && result != null) {
                auditData.put("result", result.toString());
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
            // Create the audit entry with the specified level
            // Determine which type of event identifier to use (enum or string)
            AuditEventType eventType = auditedAnnotation.type();
            String typeString = auditedAnnotation.typeString();
            
            if (eventType != AuditEventType.HTTP_REQUEST || !StringUtils.isNotEmpty(typeString)) {
                // Use the enum type (preferred)
                auditService.audit(eventType, auditData, auditedAnnotation.level());
            } else {
                // Use the string type (for backward compatibility)
                auditService.audit(typeString, auditData, auditedAnnotation.level());
            }
        }
    }
}