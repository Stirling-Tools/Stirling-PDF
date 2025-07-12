package stirling.software.proprietary.audit;

import java.lang.reflect.Method;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.apache.commons.lang3.StringUtils;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.config.AuditConfigurationProperties;

/**
 * Shared utilities for audit aspects to ensure consistent behavior across different audit
 * mechanisms.
 */
@Slf4j
public class AuditUtils {

    /**
     * Create a standard audit data map with common attributes based on the current audit level
     *
     * @param joinPoint The AspectJ join point
     * @param auditLevel The current audit level
     * @return A map with standard audit data
     */
    public static Map<String, Object> createBaseAuditData(
            ProceedingJoinPoint joinPoint, AuditLevel auditLevel) {
        Map<String, Object> data = new HashMap<>();

        // Common data for all levels
        data.put("timestamp", Instant.now().toString());

        // Add principal if available
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null) {
            data.put("principal", auth.getName());
        } else {
            data.put("principal", "system");
        }

        // Add class name and method name only at VERBOSE level
        if (auditLevel.includes(AuditLevel.VERBOSE)) {
            data.put("className", joinPoint.getTarget().getClass().getName());
            data.put(
                    "methodName",
                    ((MethodSignature) joinPoint.getSignature()).getMethod().getName());
        }

        return data;
    }

    /**
     * Add HTTP-specific information to the audit data if available
     *
     * @param data The existing audit data map
     * @param httpMethod The HTTP method (GET, POST, etc.)
     * @param path The request path
     * @param auditLevel The current audit level
     */
    public static void addHttpData(
            Map<String, Object> data, String httpMethod, String path, AuditLevel auditLevel) {
        if (httpMethod == null || path == null) {
            return; // Skip if we don't have basic HTTP info
        }

        // BASIC level HTTP data
        data.put("httpMethod", httpMethod);
        data.put("path", path);

        // Get request attributes safely
        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            return; // No request context available
        }

        HttpServletRequest req = attrs.getRequest();
        if (req == null) {
            return; // No request available
        }

        // STANDARD level HTTP data
        if (auditLevel.includes(AuditLevel.STANDARD)) {
            data.put("clientIp", req.getRemoteAddr());
            data.put(
                    "sessionId",
                    req.getSession(false) != null ? req.getSession(false).getId() : null);
            data.put("requestId", MDC.get("requestId"));

            // Form data for POST/PUT/PATCH
            if (("POST".equalsIgnoreCase(httpMethod)
                            || "PUT".equalsIgnoreCase(httpMethod)
                            || "PATCH".equalsIgnoreCase(httpMethod))
                    && req.getContentType() != null) {

                String contentType = req.getContentType();
                if (contentType.contains("application/x-www-form-urlencoded")
                        || contentType.contains("multipart/form-data")) {

                    Map<String, String[]> params = new HashMap<>(req.getParameterMap());
                    // Remove CSRF token from logged parameters
                    params.remove("_csrf");

                    if (!params.isEmpty()) {
                        data.put("formParams", params);
                    }
                }
            }
        }
    }

    /**
     * Add file information to the audit data if available
     *
     * @param data The existing audit data map
     * @param joinPoint The AspectJ join point
     * @param auditLevel The current audit level
     */
    public static void addFileData(
            Map<String, Object> data, ProceedingJoinPoint joinPoint, AuditLevel auditLevel) {
        if (auditLevel.includes(AuditLevel.STANDARD)) {
            List<MultipartFile> files =
                    Arrays.stream(joinPoint.getArgs())
                            .filter(a -> a instanceof MultipartFile)
                            .map(a -> (MultipartFile) a)
                            .collect(Collectors.toList());

            if (!files.isEmpty()) {
                List<Map<String, Object>> fileInfos =
                        files.stream()
                                .map(
                                        f -> {
                                            Map<String, Object> m = new HashMap<>();
                                            m.put("name", f.getOriginalFilename());
                                            m.put("size", f.getSize());
                                            m.put("type", f.getContentType());
                                            return m;
                                        })
                                .collect(Collectors.toList());

                data.put("files", fileInfos);
            }
        }
    }

    /**
     * Add method arguments to the audit data
     *
     * @param data The existing audit data map
     * @param joinPoint The AspectJ join point
     * @param auditLevel The current audit level
     */
    public static void addMethodArguments(
            Map<String, Object> data, ProceedingJoinPoint joinPoint, AuditLevel auditLevel) {
        if (auditLevel.includes(AuditLevel.VERBOSE)) {
            MethodSignature sig = (MethodSignature) joinPoint.getSignature();
            String[] names = sig.getParameterNames();
            Object[] vals = joinPoint.getArgs();
            if (names != null && vals != null) {
                IntStream.range(0, names.length)
                        .forEach(
                                i -> {
                                    if (vals[i] != null) {
                                        // Convert objects to safe string representation
                                        data.put("arg_" + names[i], safeToString(vals[i], 500));
                                    } else {
                                        data.put("arg_" + names[i], null);
                                    }
                                });
            }
        }
    }

    /**
     * Safely convert an object to string with size limiting
     *
     * @param obj The object to convert
     * @param maxLength Maximum length of the resulting string
     * @return A safe string representation, truncated if needed
     */
    public static String safeToString(Object obj, int maxLength) {
        if (obj == null) {
            return "null";
        }

        String result;
        try {
            // Handle common types directly to avoid toString() overhead
            if (obj instanceof String) {
                result = (String) obj;
            } else if (obj instanceof Number || obj instanceof Boolean) {
                result = obj.toString();
            } else if (obj instanceof byte[]) {
                result = "[binary data length=" + ((byte[]) obj).length + "]";
            } else {
                // For complex objects, use toString but handle exceptions
                result = obj.toString();
            }

            // Truncate if necessary
            if (result != null && result.length() > maxLength) {
                return StringUtils.truncate(result, maxLength - 3) + "...";
            }

            return result;
        } catch (Exception e) {
            // If toString() fails, return the class name
            return "[" + obj.getClass().getName() + " - toString() failed]";
        }
    }

    /**
     * Determine if a method should be audited based on config and annotation
     *
     * @param method The method to check
     * @param auditConfig The audit configuration
     * @return true if the method should be audited
     */
    public static boolean shouldAudit(Method method, AuditConfigurationProperties auditConfig) {
        // First check if audit is globally enabled - fast path
        if (!auditConfig.isEnabled()) {
            return false;
        }

        // Check for annotation override
        Audited auditedAnnotation = method.getAnnotation(Audited.class);
        AuditLevel requiredLevel =
                (auditedAnnotation != null) ? auditedAnnotation.level() : AuditLevel.BASIC;

        // Check if the required level is enabled
        return auditConfig.getAuditLevel().includes(requiredLevel);
    }

    /**
     * Add timing and response status data to the audit record
     *
     * @param data The audit data to add to
     * @param startTime The start time in milliseconds
     * @param response The HTTP response (may be null for non-HTTP methods)
     * @param level The current audit level
     * @param isHttpRequest Whether this is an HTTP request (controller) or a regular method call
     */
    public static void addTimingData(
            Map<String, Object> data,
            long startTime,
            HttpServletResponse response,
            AuditLevel level,
            boolean isHttpRequest) {
        if (level.includes(AuditLevel.STANDARD)) {
            // For HTTP requests, let ControllerAuditAspect handle timing separately
            // For non-HTTP methods, add execution time here
            if (!isHttpRequest) {
                data.put("latencyMs", System.currentTimeMillis() - startTime);
            }

            // Add HTTP status code if available
            if (response != null) {
                try {
                    data.put("statusCode", response.getStatus());
                } catch (Exception e) {
                    // Ignore - response might be in an inconsistent state
                }
            }
        }
    }

    /**
     * Resolve the event type to use for auditing, considering annotations and context
     *
     * @param method The method being audited
     * @param controller The controller class
     * @param path The request path (may be null for non-HTTP methods)
     * @param httpMethod The HTTP method (may be null for non-HTTP methods)
     * @param annotation The @Audited annotation (may be null)
     * @return The resolved event type (never null)
     */
    public static AuditEventType resolveEventType(
            Method method,
            Class<?> controller,
            String path,
            String httpMethod,
            Audited annotation) {
        // First check if we have an explicit annotation
        if (annotation != null && annotation.type() != AuditEventType.HTTP_REQUEST) {
            return annotation.type();
        }

        // For HTTP methods, infer based on controller and path
        if (httpMethod != null && path != null) {
            String cls = controller.getSimpleName().toLowerCase();
            String pkg = controller.getPackage().getName().toLowerCase();

            if ("GET".equals(httpMethod)) return AuditEventType.HTTP_REQUEST;

            if (cls.contains("user")
                    || cls.contains("auth")
                    || pkg.contains("auth")
                    || path.startsWith("/user")
                    || path.startsWith("/login")) {
                return AuditEventType.USER_PROFILE_UPDATE;
            } else if (cls.contains("admin")
                    || path.startsWith("/admin")
                    || path.startsWith("/settings")) {
                return AuditEventType.SETTINGS_CHANGED;
            } else if (cls.contains("file")
                    || path.startsWith("/file")
                    || path.matches("(?i).*/(upload|download)/.*")) {
                return AuditEventType.FILE_OPERATION;
            }
        }

        // Default for non-HTTP methods or when no specific match
        return AuditEventType.PDF_PROCESS;
    }

    /**
     * Determine the appropriate audit level to use
     *
     * @param method The method to check
     * @param defaultLevel The default level to use if no annotation present
     * @param auditConfig The audit configuration
     * @return The audit level to use
     */
    public static AuditLevel getEffectiveAuditLevel(
            Method method, AuditLevel defaultLevel, AuditConfigurationProperties auditConfig) {
        Audited auditedAnnotation = method.getAnnotation(Audited.class);
        if (auditedAnnotation != null) {
            // Method has @Audited - use its level
            return auditedAnnotation.level();
        }

        // Use default level (typically from global config)
        return defaultLevel;
    }

    /**
     * Determine the appropriate audit event type to use
     *
     * @param method The method being audited
     * @param controller The controller class
     * @param path The request path
     * @param httpMethod The HTTP method
     * @return The determined audit event type
     */
    public static AuditEventType determineAuditEventType(
            Method method, Class<?> controller, String path, String httpMethod) {
        // First check for explicit annotation
        Audited auditedAnnotation = method.getAnnotation(Audited.class);
        if (auditedAnnotation != null) {
            return auditedAnnotation.type();
        }

        // Otherwise infer from controller and path
        String cls = controller.getSimpleName().toLowerCase();
        String pkg = controller.getPackage().getName().toLowerCase();

        if ("GET".equals(httpMethod)) return AuditEventType.HTTP_REQUEST;

        if (cls.contains("user")
                || cls.contains("auth")
                || pkg.contains("auth")
                || path.startsWith("/user")
                || path.startsWith("/login")) {
            return AuditEventType.USER_PROFILE_UPDATE;
        } else if (cls.contains("admin")
                || path.startsWith("/admin")
                || path.startsWith("/settings")) {
            return AuditEventType.SETTINGS_CHANGED;
        } else if (cls.contains("file")
                || path.startsWith("/file")
                || path.matches("(?i).*/(upload|download)/.*")) {
            return AuditEventType.FILE_OPERATION;
        } else {
            return AuditEventType.PDF_PROCESS;
        }
    }

    /**
     * Get the current HTTP request if available
     *
     * @return The current request or null if not in a request context
     */
    public static HttpServletRequest getCurrentRequest() {
        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        return attrs != null ? attrs.getRequest() : null;
    }

    /**
     * Check if a GET request is for a static resource
     *
     * @param request The HTTP request
     * @return true if this is a static resource request
     */
    public static boolean isStaticResourceRequest(HttpServletRequest request) {
        return request != null
                && !RequestUriUtils.isTrackableResource(
                        request.getContextPath(), request.getRequestURI());
    }
}
