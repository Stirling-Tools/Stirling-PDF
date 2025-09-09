package stirling.software.proprietary.security.database;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class H2SQLCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        var env = context.getEnvironment();
        boolean enableCustomDatabase =
                env.getProperty("system.datasource.enableCustomDatabase", Boolean.class, false);

        if (!enableCustomDatabase) {
            log.info("Custom database is not enabled; enabling H2-specific beans.");
            return true;
        }
        log.info("Custom database is enabled; skipping H2-specific beans.");
        return false;
    }
}
