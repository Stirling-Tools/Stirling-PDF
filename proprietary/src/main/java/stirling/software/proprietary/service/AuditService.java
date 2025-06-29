package stirling.software.proprietary.service;

import java.util.Map;

import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.config.AuditConfigurationProperties;

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
            @org.springframework.beans.factory.annotation.Qualifier("runningEE")
                    boolean runningEE) {
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
        repository.add(new AuditEvent(principal, type.name(), data));
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
        repository.add(new AuditEvent(principal, type, data));
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

    /** Get the current authenticated username or "system" if none */
    private String getCurrentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return (auth != null && auth.getName() != null) ? auth.getName() : "system";
    }
}
