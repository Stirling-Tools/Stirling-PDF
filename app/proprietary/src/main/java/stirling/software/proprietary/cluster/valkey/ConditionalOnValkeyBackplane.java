package stirling.software.proprietary.cluster.valkey;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;

/**
 * Composite condition: cluster.enabled=true AND cluster.backplane=valkey.
 *
 * <p>Either condition alone is insufficient - enabled=true with backplane=inprocess would crash at
 * boot with no StringRedisTemplate, and enabled=false must skip all Valkey beans entirely.
 * Spring's @ConditionalOnProperty cannot be applied twice, so we use @ConditionalOnExpression.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@ConditionalOnExpression(
        "${cluster.enabled:false} and '${cluster.backplane:inprocess}'.equals('valkey')")
public @interface ConditionalOnValkeyBackplane {}
