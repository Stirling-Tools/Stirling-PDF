package stirling.software.proprietary.cluster.valkey;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import io.quarkus.arc.lookup.LookupIfProperty;

/**
 * Composite condition: matches only when cluster.enabled=true AND cluster.backplane=valkey. Both
 * checks are required (enabled alone may select the in-process backplane, which must not load
 * Valkey beans); a single guard keeps the condition in one place.
 *
 * <p>The original Spring annotation used a single
 * {@code @ConditionalOnExpression("${cluster.enabled:false} and
 * '${cluster.backplane:inprocess}'.equals('valkey')")} SpEL guard. Quarkus/CDI has no SpEL-based
 * conditional, but the boolean AND of two simple property checks maps directly onto two stacked
 * (repeatable) {@link LookupIfProperty} annotations, which are evaluated with AND semantics. The
 * Valkey producer beans are looked up only when both properties hold; otherwise the
 * {@code @DefaultBean} in-process implementations win.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@LookupIfProperty(name = "cluster.enabled", stringValue = "true")
@LookupIfProperty(name = "cluster.backplane", stringValue = "valkey")
public @interface ConditionalOnValkeyBackplane {}
