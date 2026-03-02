package stirling.software.proprietary.service;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;

/**
 * Service for audit event creation, data collection, and persistence. Combines persistence logic
 * with data collection utilities for comprehensive audit trail management.
 */
@Slf4j
@Service
public class AuditService {

    private final AuditEventRepository repository;
    private final AuditConfigurationProperties auditConfig;
    private final boolean runningEE;
    private final CustomPDFDocumentFactory pdfDocumentFactory;

    public AuditService(
            AuditEventRepository repository,
            AuditConfigurationProperties auditConfig,
            @Qualifier("runningEE") boolean runningEE,
            CustomPDFDocumentFactory pdfDocumentFactory) {
        this.repository = repository;
        this.auditConfig = auditConfig;
        this.runningEE = runningEE;
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    // ========== PERSISTENCE METHODS ==========

    /**
     * Record an audit event for the current authenticated user with a specific audit level using
     * the standardized AuditEventType enum
     *
     * @param type The event type from AuditEventType enum
     * @param data Additional event data (will be automatically sanitized)
     * @param level The minimum audit level required for this event to be logged
     */
    public void audit(AuditEventType type, Map<String, Object> data, AuditLevel level) {
        // Skip auditing if this level is not enabled or if not Enterprise edition
        if (!auditConfig.isEnabled()
                || !auditConfig.getAuditLevel().includes(level)
                || !runningEE) {
            return;
        }

        String principal = getCurrentUsername();

        // Add origin to the data map (captured here before async execution)
        Map<String, Object> enrichedData = new java.util.HashMap<>(data);
        enrichedData.put("__origin", determineOrigin());

        repository.add(new AuditEvent(principal, type.name(), enrichedData));
    }

    /**
     * Record an audit event for the current authenticated user with standard level using the
     * standardized AuditEventType enum
     *
     * @param type The event type from AuditEventType enum
     * @param data Additional event data (will be automatically sanitized)
     */
    public void audit(AuditEventType type, Map<String, Object> data) {
        // Default to STANDARD level
        audit(type, data, AuditLevel.STANDARD);
    }

    /**
     * Record an audit event for a specific user with a specific audit level using the standardized
     * AuditEventType enum
     *
     * @param principal The username or system identifier
     * @param type The event type from AuditEventType enum
     * @param data Additional event data (will be automatically sanitized)
     * @param level The minimum audit level required for this event to be logged
     */
    public void audit(
            String principal, AuditEventType type, Map<String, Object> data, AuditLevel level) {
        // Skip auditing if this level is not enabled or if not Enterprise edition
        if (!auditConfig.isLevelEnabled(level) || !runningEE) {
            return;
        }

        repository.add(new AuditEvent(principal, type.name(), data));
    }

    /**
     * Record an audit event for a specific user with standard level using the standardized
     * AuditEventType enum
     *
     * @param principal The username or system identifier
     * @param type The event type from AuditEventType enum
     * @param data Additional event data (will be automatically sanitized)
     */
    public void audit(String principal, AuditEventType type, Map<String, Object> data) {
        // Default to STANDARD level
        audit(principal, type, data, AuditLevel.STANDARD);
    }

    /**
     * Record an audit event for the current authenticated user with a specific audit level using a
     * string-based event type (for backward compatibility)
     *
     * @param type The event type (e.g., "FILE_UPLOAD", "PASSWORD_CHANGE")
     * @param data Additional event data (will be automatically sanitized)
     * @param level The minimum audit level required for this event to be logged
     */
    public void audit(String type, Map<String, Object> data, AuditLevel level) {
        // Skip auditing if this level is not enabled or if not Enterprise edition
        if (!auditConfig.isLevelEnabled(level) || !runningEE) {
            return;
        }

        String principal = getCurrentUsername();

        // Add origin to the data map (captured here before async execution)
        Map<String, Object> enrichedData = new java.util.HashMap<>(data);
        enrichedData.put("__origin", determineOrigin());

        repository.add(new AuditEvent(principal, type, enrichedData));
    }

    /**
     * Record an audit event for the current authenticated user with standard level using a
     * string-based event type (for backward compatibility)
     *
     * @param type The event type (e.g., "FILE_UPLOAD", "PASSWORD_CHANGE")
     * @param data Additional event data (will be automatically sanitized)
     */
    public void audit(String type, Map<String, Object> data) {
        // Default to STANDARD level
        audit(type, data, AuditLevel.STANDARD);
    }

    /**
     * Record an audit event for a specific user with a specific audit level using a string-based
     * event type (for backward compatibility)
     *
     * @param principal The username or system identifier
     * @param type The event type (e.g., "FILE_UPLOAD", "PASSWORD_CHANGE")
     * @param data Additional event data (will be automatically sanitized)
     * @param level The minimum audit level required for this event to be logged
     */
    public void audit(String principal, String type, Map<String, Object> data, AuditLevel level) {
        // Skip auditing if this level is not enabled or if not Enterprise edition
        if (!auditConfig.isLevelEnabled(level) || !runningEE) {
            return;
        }

        repository.add(new AuditEvent(principal, type, data));
    }

    /**
     * Record an audit event for a specific user with standard level using a string-based event type
     * (for backward compatibility)
     *
     * @param principal The username or system identifier
     * @param type The event type (e.g., "FILE_UPLOAD", "PASSWORD_CHANGE")
     * @param data Additional event data (will be automatically sanitized)
     */
    public void audit(String principal, String type, Map<String, Object> data) {
        // Default to STANDARD level
        audit(principal, type, data, AuditLevel.STANDARD);
    }

    /**
     * Record an audit event with pre-captured principal, origin, and IP (for use by audit aspects).
     */
    public void audit(
            String principal,
            String origin,
            String ipAddress,
            AuditEventType type,
            Map<String, Object> data,
            AuditLevel level) {
        if (!auditConfig.isEnabled()
                || !auditConfig.getAuditLevel().includes(level)
                || !runningEE) {
            return;
        }

        // Add origin and IP to the data map (already captured before async)
        Map<String, Object> enrichedData = new java.util.HashMap<>(data);
        enrichedData.put("__origin", origin);
        if (ipAddress != null) {
            enrichedData.put("__ipAddress", ipAddress);
        }

        repository.add(new AuditEvent(principal, type.name(), enrichedData));
    }

    /**
     * Record an audit event with pre-captured principal, origin, and IP using string type (for
     * backward compatibility).
     */
    public void audit(
            String principal,
            String origin,
            String ipAddress,
            String type,
            Map<String, Object> data,
            AuditLevel level) {
        if (!auditConfig.isEnabled()
                || !auditConfig.getAuditLevel().includes(level)
                || !runningEE) {
            return;
        }

        // Add origin and IP to the data map (already captured before async)
        Map<String, Object> enrichedData = new java.util.HashMap<>(data);
        enrichedData.put("__origin", origin);
        if (ipAddress != null) {
            enrichedData.put("__ipAddress", ipAddress);
        }

        repository.add(new AuditEvent(principal, type, enrichedData));
    }

    // ========== DATA COLLECTION METHODS ==========

    /**
     * Create a standard audit data map with common attributes based on the current audit level
     *
     * @param joinPoint The AspectJ join point
     * @param auditLevel The current audit level
     * @return A map with standard audit data
     */
    public Map<String, Object> createBaseAuditData(
            ProceedingJoinPoint joinPoint, AuditLevel auditLevel) {
        Map<String, Object> data = new HashMap<>();

        // Common data for all levels
        data.put("timestamp", Instant.now().toString());

        // Add principal: prefer MDC (captured on request thread) over SecurityContext
        // This ensures consistency in async contexts where SecurityContext may not be available
        String principal = MDC.get("auditPrincipal");
        if (principal == null) {
            // Fallback: capture from SecurityContext if running in request thread
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            principal = (auth != null && auth.getName() != null) ? auth.getName() : "system";
        }
        data.put("principal", principal);

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
    public void addHttpData(
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
            // Use extracted client IP (supports X-Forwarded-For, X-Real-IP behind proxies)
            data.put("clientIp", extractClientIp(req));
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
                if (contentType.contains(MediaType.APPLICATION_FORM_URLENCODED_VALUE)
                        || contentType.contains(MediaType.MULTIPART_FORM_DATA_VALUE)) {

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
    public void addFileData(
            Map<String, Object> data, ProceedingJoinPoint joinPoint, AuditLevel auditLevel) {
        if (auditLevel.includes(AuditLevel.STANDARD)) {
            List<MultipartFile> files = new ArrayList<>();

            // Extract files from multiple sources:
            for (Object arg : joinPoint.getArgs()) {
                // 1. Direct MultipartFile arguments
                if (arg instanceof MultipartFile) {
                    files.add((MultipartFile) arg);
                }
                // 2. MultipartFile[] arrays (ConvertToPdfRequest, HandleDataRequest, etc.)
                else if (arg instanceof MultipartFile[]) {
                    files.addAll(Arrays.asList((MultipartFile[]) arg));
                }
                // 3. PDFFile-based objects (request wrappers like OptimizePdfRequest,
                // MergePdfsRequest)
                else if (arg instanceof PDFFile) {
                    MultipartFile fileInput = ((PDFFile) arg).getFileInput();
                    if (fileInput != null) {
                        files.add(fileInput);
                    }
                }
            }

            if (!files.isEmpty()) {
                List<Map<String, Object>> fileInfos =
                        files.stream()
                                .map(
                                        f -> {
                                            Map<String, Object> m = new HashMap<>();
                                            m.put("name", f.getOriginalFilename());
                                            m.put("size", f.getSize());
                                            m.put("type", f.getContentType());

                                            // Add file metadata if enabled (independent of audit
                                            // level)
                                            if (auditConfig.isCaptureFileHash()
                                                    || auditConfig.isCapturePdfAuthor()) {
                                                addFileMetadata(m, f);
                                            }

                                            return m;
                                        })
                                .collect(Collectors.toList());

                data.put("files", fileInfos);
            }
        }
    }

    /**
     * Extract SHA-256 hash and PDF author metadata for a file
     *
     * @param fileData The file data map to add metadata to
     * @param file The MultipartFile to extract metadata from
     */
    private void addFileMetadata(Map<String, Object> fileData, MultipartFile file) {
        // Extract SHA-256 hash if enabled (using streaming to avoid loading entire file into
        // memory)
        if (auditConfig.isCaptureFileHash()) {
            try (InputStream is = file.getInputStream()) {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                DigestInputStream dis = new DigestInputStream(is, digest);
                byte[] buffer = new byte[8192];
                while (dis.read(buffer) != -1) {
                    // Just read through the stream to compute digest
                }
                byte[] hashBytes = digest.digest();
                StringBuilder hexString = new StringBuilder();
                for (byte b : hashBytes) {
                    hexString.append(String.format("%02x", b));
                }
                fileData.put("fileHash", hexString.toString());
            } catch (Exception e) {
                log.debug(
                        "Could not calculate file hash for {}: {}",
                        file.getOriginalFilename(),
                        e.getMessage());
            }
        }

        // Extract PDF author if file is a PDF and enabled
        if (auditConfig.isCapturePdfAuthor()
                && "application/pdf".equalsIgnoreCase(file.getContentType())) {
            try (InputStream is = file.getInputStream();
                    PDDocument doc = pdfDocumentFactory.load(is, true)) {
                PDDocumentInformation info = doc.getDocumentInformation();
                if (info != null && info.getAuthor() != null) {
                    fileData.put("pdfAuthor", info.getAuthor());
                }
            } catch (Exception e) {
                log.debug(
                        "Could not extract PDF author from {}: {}",
                        file.getOriginalFilename(),
                        e.getMessage());
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
    public void addMethodArguments(
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
    public String safeToString(Object obj, int maxLength) {
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
    public boolean shouldAudit(Method method, AuditConfigurationProperties auditConfig) {
        // First check if we're running Enterprise Edition and audit is enabled - fast path
        if (!runningEE || !auditConfig.isEnabled()) {
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
    public void addTimingData(
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
    public AuditEventType resolveEventType(
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
            String cls = controller.getSimpleName().toLowerCase(Locale.ROOT);
            String pkg = controller.getPackage().getName().toLowerCase(Locale.ROOT);

            if ("GET".equals(httpMethod)) {
                // Categorize GET requests as UI_DATA (UI data fetches)
                // API endpoints use POST/PUT/DELETE, or are specific operational endpoints
                if (isUiDataEndpoint(path)) {
                    return AuditEventType.UI_DATA;
                }
                return AuditEventType.HTTP_REQUEST;
            }

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
                    || RegexPatternUtils.getInstance()
                            .getUploadDownloadPathPattern()
                            .matcher(path)
                            .matches()) {
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
    public AuditLevel getEffectiveAuditLevel(
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
    public AuditEventType determineAuditEventType(
            Method method, Class<?> controller, String path, String httpMethod) {
        // First check for explicit annotation
        Audited auditedAnnotation = method.getAnnotation(Audited.class);
        if (auditedAnnotation != null) {
            return auditedAnnotation.type();
        }

        // Otherwise infer from controller and path
        String cls = controller.getSimpleName().toLowerCase(Locale.ROOT);
        String pkg = controller.getPackage().getName().toLowerCase(Locale.ROOT);

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
                || RegexPatternUtils.getInstance()
                        .getUploadDownloadPathPattern()
                        .matcher(path)
                        .matches()) {
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
    public HttpServletRequest getCurrentRequest() {
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
    public boolean isStaticResourceRequest(HttpServletRequest request) {
        return request != null
                && !RequestUriUtils.isTrackableResource(
                        request.getContextPath(), request.getRequestURI());
    }

    /**
     * Check if a GET request is a continuous polling call that should be excluded from STANDARD
     * level
     *
     * @param request The HTTP request
     * @return true if this is a polling/continuous call that should be excluded from STANDARD level
     */
    public boolean isPollingCall(HttpServletRequest request) {
        if (request == null) {
            return false;
        }

        String path = request.getRequestURI();
        String method = request.getMethod();

        // Only filter GET requests
        if (!"GET".equalsIgnoreCase(method)) {
            return false;
        }

        // List of polling endpoints that should be excluded from STANDARD level auditing
        return path.contains("/auth/me")
                || path.contains("/app-config")
                || path.contains("/footer-info")
                || path.contains("/admin/license-info")
                || path.contains("/endpoints-availability")
                || path.contains("/health")
                || path.contains("/metrics");
    }

    // ========== HELPER METHODS ==========

    /**
     * Check if an endpoint is an API endpoint. API endpoints match /api/v1/* pattern but exclude
     * /api/v1/auth/*, /api/v1/ui-data/*, /api/v1/proprietary/ui-data/*, /api/v1/config/*, and
     * /api/v1/admin/license-info. Everything else is considered "UI".
     *
     * @param endpoint The endpoint path to check
     * @return true if this is an API endpoint, false if it's a UI endpoint
     */
    private boolean isUiDataEndpoint(String endpoint) {
        if (endpoint == null) {
            return false;
        }

        // UI data endpoints include auth, settings, config, user/team management, and UI data
        // fetches
        return endpoint.startsWith("/api/v1/auth/")
                || endpoint.startsWith("/api/v1/ui-data/")
                || endpoint.startsWith("/api/v1/proprietary/ui-data/")
                || endpoint.startsWith("/api/v1/config/")
                || endpoint.startsWith("/api/v1/admin/settings/")
                || endpoint.startsWith("/api/v1/user/")
                || endpoint.startsWith("/api/v1/users/")
                || endpoint.equals("/api/v1/admin/license-info")
                || endpoint.equals("/login");
    }

    /**
     * Check if operation results (return values) should be captured
     *
     * @return true if captureOperationResults is enabled in config
     */
    public boolean shouldCaptureOperationResults() {
        return auditConfig.isCaptureOperationResults();
    }

    /** Get the current authenticated username or "system" if none */
    private String getCurrentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getName() != null) ? auth.getName() : "system";
    }

    /**
     * Captures the current principal for later use (avoids SecurityContext issues in async/thread
     * changes). Public so audit aspects can capture early before thread context changes.
     */
    public String captureCurrentPrincipal() {
        String principal = getCurrentUsername();
        return principal;
    }

    /**
     * Captures the current origin for later use (avoids SecurityContext issues in async/thread
     * changes). Public so audit aspects can capture early before thread context changes.
     */
    public String captureCurrentOrigin() {
        String origin = determineOrigin();
        return origin;
    }

    /**
     * Determines the origin of the request: API (X-API-KEY), WEB (JWT), or SYSTEM (no auth).
     * IMPORTANT: This must be called in the request thread before async execution.
     *
     * @return "API", "WEB", or "SYSTEM"
     */
    private String determineOrigin() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();

            // Check if authenticated via API key
            if (auth instanceof ApiKeyAuthenticationToken) {
                return "API";
            }

            // Check if authenticated via JWT (web user)
            if (auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getName())) {
                return "WEB";
            }

            // System or unauthenticated
            return "SYSTEM";
        } catch (Exception e) {
            log.debug("Could not determine origin for audit event", e);
            return "SYSTEM";
        }
    }

    /**
     * Extract client IP address from the request, preferring X-Forwarded-For header for proxy/load
     * balancer support. IMPORTANT: Must be called in the request thread before async execution to
     * preserve the IP.
     *
     * @param request The HTTP request
     * @return The client IP address, or null if not available
     */
    public String extractClientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }

        // Try X-Forwarded-For first (set by proxies/load balancers)
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (StringUtils.isNotBlank(forwardedFor)) {
            // X-Forwarded-For can contain multiple IPs, take the first one (original client)
            String[] ips = forwardedFor.split(",");
            return ips[0].trim();
        }

        // Try X-Real-IP (used by some proxies)
        String realIp = request.getHeader("X-Real-IP");
        if (StringUtils.isNotBlank(realIp)) {
            return realIp;
        }

        // Fall back to remote address
        return request.getRemoteAddr();
    }
}
