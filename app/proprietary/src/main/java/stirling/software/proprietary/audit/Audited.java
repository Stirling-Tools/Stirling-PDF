package stirling.software.proprietary.audit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.enterprise.util.Nonbinding;
import jakarta.interceptor.InterceptorBinding;

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
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@InterceptorBinding
public @interface Audited {

    @Nonbinding
    AuditEventType type() default AuditEventType.HTTP_REQUEST;

    @Nonbinding
    String typeString() default "";

    @Nonbinding
    AuditLevel level() default AuditLevel.STANDARD;

    @Nonbinding
    boolean includeArgs() default true;

    @Nonbinding
    boolean includeResult() default false;
}
