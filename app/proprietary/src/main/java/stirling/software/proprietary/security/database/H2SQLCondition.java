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

        if (enableCustomDatabase) {
            return false;
        }

        String dataSourceType = env.getProperty("system.datasource.type", String.class, "");
        return "h2".equalsIgnoreCase(dataSourceType);
    }
}
