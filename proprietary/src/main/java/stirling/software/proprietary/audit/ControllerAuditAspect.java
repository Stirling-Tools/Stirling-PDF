package stirling.software.proprietary.audit;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.MDC;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
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

    
    @Around("execution(* org.springframework.web.servlet.resource.ResourceHttpRequestHandler.handleRequest(..))")
    public Object auditStaticResource(ProceedingJoinPoint jp)  throws Throwable {
    	log.info("HELLOOOOOOOOOOOOOOOO");
    	return auditController(jp, "GET");
    	
    	
    }
    /**
     * Intercept all methods with GetMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.GetMapping)")
    public Object auditGetMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "GET");
    }

    /**
     * Intercept all methods with PostMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.PostMapping)")
    public Object auditPostMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "POST");
    }

    /**
     * Intercept all methods with PutMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.PutMapping)")
    public Object auditPutMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "PUT");
    }

    /**
     * Intercept all methods with DeleteMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.DeleteMapping)")
    public Object auditDeleteMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "DELETE");
    }

    /**
     * Intercept all methods with PatchMapping annotation
     */
    @Around("@annotation(org.springframework.web.bind.annotation.PatchMapping)")
    public Object auditPatchMethod(ProceedingJoinPoint joinPoint) throws Throwable {
        return auditController(joinPoint, "PATCH");
    }

    private Object auditController(ProceedingJoinPoint joinPoint, String httpMethod) throws Throwable {
        MethodSignature sig = (MethodSignature) joinPoint.getSignature();
        Method method = sig.getMethod();
        AuditLevel level = auditConfig.getAuditLevel();
        // OFF below BASIC?
        if (!auditConfig.isLevelEnabled(AuditLevel.BASIC)) {
            return joinPoint.proceed();
        }

//        // Opt-out
//        if (method.isAnnotationPresent(Audited.class)) {
//            return joinPoint.proceed();
//        }

        String path = getRequestPath(method, httpMethod);

        // Skip static GET resources
        if ("GET".equals(httpMethod)) {
            HttpServletRequest maybe = getCurrentRequest();
            if (maybe != null && !RequestUriUtils.isTrackableResource(maybe.getContextPath(), maybe.getRequestURI())) {
                return joinPoint.proceed();
            }
        }

        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest req = attrs != null ? attrs.getRequest() : null;
        HttpServletResponse resp = attrs != null ? attrs.getResponse() : null;

        long start = System.currentTimeMillis();
        Map<String, Object> data = new HashMap<>();

        // BASIC
        if (level.includes(AuditLevel.BASIC)) {
            data.put("timestamp", Instant.now().toString());
            data.put("principal", SecurityContextHolder.getContext().getAuthentication().getName());
            data.put("path", path);
            data.put("httpMethod", httpMethod);
        }

        // STANDARD
        if (level.includes(AuditLevel.STANDARD) && req != null) {
            data.put("clientIp", req.getRemoteAddr());
            data.put("sessionId", req.getSession(false) != null ? req.getSession(false).getId() : null);
            data.put("requestId", MDC.get("requestId"));
            
            if ("POST".equalsIgnoreCase(httpMethod)
            		         || "PUT".equalsIgnoreCase(httpMethod)
            		         || "PATCH".equalsIgnoreCase(httpMethod)) {
            		            String ct = req.getContentType();
            		            if (ct != null && (
            		                 ct.contains("application/x-www-form-urlencoded") ||
            		                 ct.contains("multipart/form-data")
            		            )) {
            		                Map<String,String[]> params = req.getParameterMap();
            		                if (!params.isEmpty()) {
            		                    data.put("formParams", params);
            		                }
            		            }
            		            
            		            List<MultipartFile> files = Arrays.stream(joinPoint.getArgs())
            		                    .filter(a -> a instanceof MultipartFile)
            		                    .map(a -> (MultipartFile)a)
            		                    .collect(Collectors.toList());

            		                if (!files.isEmpty()) {
            		                    List<Map<String,Object>> fileInfos = files.stream().map(f -> {
            		                        Map<String,Object> m = new HashMap<>();
            		                        m.put("name",     f.getOriginalFilename());
            		                        m.put("size",     f.getSize());
            		                        m.put("type",     f.getContentType());
            		                        return m;
            		                    }).collect(Collectors.toList());

            		                    data.put("files", fileInfos);
            		                }
            		                
            		        }
            
        }

        // VERBOSE args
        if (level.includes(AuditLevel.VERBOSE)) {
            String[] names = sig.getParameterNames();
            Object[] vals = joinPoint.getArgs();
            if (names != null && vals != null) {
                IntStream.range(0, names.length).forEach(i -> data.put("arg_" + names[i], vals[i]));
            }
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
            // finalize STANDARD
            if (level.includes(AuditLevel.STANDARD)) {
                data.put("latencyMs", System.currentTimeMillis() - start);
                if (resp != null) data.put("statusCode", resp.getStatus());
            }
            // finalize VERBOSE result
            if (level.includes(AuditLevel.VERBOSE) && result != null) {
                data.put("result", result.toString());
            }
            AuditEventType type = determineAuditEventType(joinPoint.getTarget().getClass(), path, httpMethod);
            auditService.audit(type, data, level);
        }
        return result;
    }

    private AuditEventType determineAuditEventType(Class<?> controller, String path, String httpMethod) {
        String cls = controller.getSimpleName().toLowerCase();
        String pkg = controller.getPackage().getName().toLowerCase();
        if ("GET".equals(httpMethod)) return AuditEventType.HTTP_REQUEST;
        if (cls.contains("user") || cls.contains("auth") || pkg.contains("auth")
                || path.startsWith("/user") || path.startsWith("/login")) {
            return AuditEventType.USER_PROFILE_UPDATE;
        } else if (cls.contains("admin") || path.startsWith("/admin") || path.startsWith("/settings")) {
            return AuditEventType.SETTINGS_CHANGED;
        } else if (cls.contains("file") || path.startsWith("/file")
                || path.matches("(?i).*/(upload|download)/.*")) {
            return AuditEventType.FILE_OPERATION;
        } else {
            return AuditEventType.PDF_PROCESS;
        }
    }

    private String getRequestPath(Method method, String httpMethod) {
        String base = "";
        RequestMapping cm = method.getDeclaringClass().getAnnotation(RequestMapping.class);
        if (cm != null && cm.value().length > 0) base = cm.value()[0];
        String mp = "";
        Annotation ann = switch (httpMethod) {
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

    private HttpServletRequest getCurrentRequest() {
        ServletRequestAttributes a = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        return a != null ? a.getRequest() : null;
    }
}
