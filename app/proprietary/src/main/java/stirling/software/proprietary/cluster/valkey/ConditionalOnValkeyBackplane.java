package stirling.software.proprietary.cluster.valkey;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;

/**
 * Composite condition: matches only when cluster.enabled=true AND cluster.backplane=valkey. Both
 * checks are required (enabled alone may select the in-process backplane, which must not load
 * Valkey beans); a single {@code @ConditionalOnExpression} keeps the guard in one place.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@ConditionalOnExpression(
        "${cluster.enabled:false} and '${cluster.backplane:inprocess}'.equals('valkey')")
public @interface ConditionalOnValkeyBackplane {}
