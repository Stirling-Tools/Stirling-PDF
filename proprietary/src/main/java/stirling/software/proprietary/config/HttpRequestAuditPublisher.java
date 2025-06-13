package stirling.software.proprietary.config;

import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.context.support.ServletRequestHandledEvent;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.util.SecretMasker;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.HashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class HttpRequestAuditPublisher
        implements ApplicationListener<ServletRequestHandledEvent> {

    private final AuditEventRepository repo;
    private final AuditConfigurationProperties auditConfig;

    @Override
    public void onApplicationEvent(ServletRequestHandledEvent e) {
        // Skip if audit is disabled or level is OFF
        if (!auditConfig.isEnabled() || auditConfig.getAuditLevel() == AuditLevel.OFF) {
            return;
        }
        
        // Basic request information is included at level STANDARD or higher
        AuditLevel currentLevel = auditConfig.getAuditLevel();
        boolean isBasicLevel = currentLevel.includes(AuditLevel.BASIC);
        boolean isStandardLevel = currentLevel.includes(AuditLevel.STANDARD);
        boolean isVerboseLevel = currentLevel.includes(AuditLevel.VERBOSE);
        
        // Special case for errors - always log errors at BASIC level
        boolean isError = e.getStatusCode() >= 400 || e.getFailureCause() != null;
        
        // Skip non-error requests if below STANDARD level
        if (!isStandardLevel && !isError) {
            return;
        }
        
        // Create a mutable map to hold all our audit data
        Map<String, Object> raw = new HashMap<>();
        
        // Add basic request data from the event (always included)
        raw.put("method", e.getMethod());
        raw.put("uri", e.getRequestUrl());
        raw.put("status", e.getStatusCode());
        raw.put("latency", e.getProcessingTimeMillis());
        raw.put("ip", e.getClientAddress());
        
        // Add standard level data
        if (isStandardLevel || isError) {
            raw.put("servlet", e.getServletName());
            raw.put("sessionId", e.getSessionId());
            raw.put("requestId", MDC.get("requestId"));
            raw.put("host", getHostName());
            raw.put("timestamp", System.currentTimeMillis());
        }
        
        // Check for failure information (always included for errors)
        if (e.getFailureCause() != null) {
            raw.put("failed", true);
            raw.put("errorType", e.getFailureCause().getClass().getName());
            raw.put("errorMessage", e.getFailureCause().getMessage());
        }
        
        // Add additional data from MDC at VERBOSE level
        if (isVerboseLevel) {
            addFromMDC(raw, "userAgent");
            addFromMDC(raw, "referer");
            addFromMDC(raw, "acceptLanguage");
            addFromMDC(raw, "contentType");
            addFromMDC(raw, "userRoles");
            addFromMDC(raw, "queryParams");
        }

        // Determine the correct audit level for this event
        AuditLevel eventLevel = isError ? AuditLevel.BASIC : 
                               isVerboseLevel ? AuditLevel.VERBOSE : 
                               AuditLevel.STANDARD;

        // Create the audit event
        repo.add(new AuditEvent(
                e.getUserName() != null ? e.getUserName() : "anonymous",
                "HTTP_REQUEST",
                SecretMasker.mask(raw)));
    }
    
    /**
     * Adds a value from MDC to the audit data map if present
     */
    private void addFromMDC(Map<String, Object> data, String key) {
        String value = MDC.get(key);
        if (StringUtils.hasText(value)) {
            data.put(key, value);
        }
    }
    
    /**
     * Gets the hostname of the current server
     */
    private String getHostName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException e) {
            return "unknown-host";
        }
    }
}