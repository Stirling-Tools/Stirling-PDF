package stirling.software.proprietary.audit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotation for methods that should be audited.
 *
 * <p>Usage:
 *
 * <pre>{@code
 * @Audited(type = AuditEventType.USER_REGISTRATION, level = AuditLevel.BASIC)
 * public void registerUser(String username) {
 *    // Method implementation
 * }
 * }</pre>
 *
 * For backward compatibility, string-based event types are still supported:
 *
 * <pre>{@code
 * @Audited(typeString = "CUSTOM_EVENT_TYPE", level = AuditLevel.BASIC)
 * public void customOperation() {
 *    // Method implementation
 * }
 * }</pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Audited {

    /**
     * The type of audit event using the standardized AuditEventType enum. This is the preferred way
     * to specify the event type.
     *
     * <p>If both type() and typeString() are specified, type() takes precedence.
     */
    AuditEventType type() default AuditEventType.HTTP_REQUEST;

    /**
     * The type of audit event as a string (e.g., "FILE_UPLOAD", "USER_REGISTRATION"). Provided for
     * backward compatibility and custom event types not in the enum.
     *
     * <p>If both type() and typeString() are specified, type() takes precedence.
     */
    String typeString() default "";

    /** The audit level at which this event should be logged */
    AuditLevel level() default AuditLevel.STANDARD;

    /** Should method arguments be included in the audit event */
    boolean includeArgs() default true;

    /** Should the method return value be included in the audit event */
    boolean includeResult() default false;
}
