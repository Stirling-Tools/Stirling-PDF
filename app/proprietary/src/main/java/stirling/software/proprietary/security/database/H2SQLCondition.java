package stirling.software.proprietary.security.database;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

public class H2SQLCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        boolean enableCustomDatabase =
                Boolean.parseBoolean(
                        context.getEnvironment()
                                .getProperty("system.datasource.enableCustomDatabase"));

        if (!enableCustomDatabase) {
            return false;
        }

        String dataSourceType = context.getEnvironment().getProperty("system.datasource.type");
        return "h2".equalsIgnoreCase(dataSourceType);
    }
}
