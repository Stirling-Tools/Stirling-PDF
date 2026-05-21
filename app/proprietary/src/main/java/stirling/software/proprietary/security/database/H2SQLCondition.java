package stirling.software.proprietary.security.database;

import java.util.Arrays;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

/** Returns {@code true} when the active deployment is genuinely on H2. */
public class H2SQLCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        var env = context.getEnvironment();

        if (Arrays.asList(env.getActiveProfiles()).contains("saas")) {
            return false;
        }

        // Legacy custom-DB block, if explicitly enabled, is authoritative.
        boolean enableCustomDatabase =
                env.getProperty("system.datasource.enableCustomDatabase", Boolean.class, false);
        if (enableCustomDatabase) {
            String dataSourceType = env.getProperty("system.datasource.type", String.class, "");
            return "h2".equalsIgnoreCase(dataSourceType);
        }

        String springDsUrl = env.getProperty("spring.datasource.url", String.class, "");
        if (springDsUrl == null || springDsUrl.isBlank()) {
            return true;
        }
        return springDsUrl.startsWith("jdbc:h2:");
    }
}
