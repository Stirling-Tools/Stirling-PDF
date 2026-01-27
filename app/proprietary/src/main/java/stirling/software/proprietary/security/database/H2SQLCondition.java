package stirling.software.proprietary.security.database;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

public class H2SQLCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        var env = context.getEnvironment();
        boolean enableCustomDatabase =
                env.getProperty("system.datasource.enableCustomDatabase", Boolean.class, false);

        // If custom database is not enabled, H2 is used by default
        if (!enableCustomDatabase) {
            return true;
        }

        String dataSourceType = env.getProperty("system.datasource.type", String.class, "");
        return "h2".equalsIgnoreCase(dataSourceType);
    }
}
