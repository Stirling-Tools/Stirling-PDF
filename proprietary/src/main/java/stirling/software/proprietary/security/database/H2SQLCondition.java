<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/database/H2SQLCondition.java
package stirling.software.proprietary.security.database;
========
package stirling.software.enterprise.security.database;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/database/H2SQLCondition.java

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
