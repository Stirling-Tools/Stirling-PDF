package stirling.software.proprietary.service;

import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;

/**
 * Service for creating manual audit events throughout the application. This provides easy access to
 * audit functionality in any component.
 */
@Slf4j
@Service
public class AuditService {

    private final AuditEventRepository repository;
    private final AuditConfigurationProperties auditConfig;
    private final boolean runningEE;

    public AuditService(
            AuditEventRepository repository,
            AuditConfigurationProperties auditConfig,
            @Qualifier("runningEE") boolean runningEE) {
        this.repository = repository;
        this.auditConfig = auditConfig;
        this.runningEE = runningEE;
    }

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
        return getCurrentUsername();
    }

    /**
     * Captures the current origin for later use (avoids SecurityContext issues in async/thread
     * changes). Public so audit aspects can capture early before thread context changes.
     */
    public String captureCurrentOrigin() {
        return determineOrigin();
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
}
