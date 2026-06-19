package stirling.software.proprietary.security.database;

import java.util.Arrays;

import org.eclipse.microprofile.config.Config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

// TODO: Migration required - this was an org.springframework.context.annotation.Condition used via
// @Conditional(H2SQLCondition.class) to gate bean/controller registration at startup. Quarkus has
// no
// runtime @Conditional equivalent (@io.quarkus.arc.profile.IfBuildProfile / @LookupIfProperty are
// build-time/property-name based and cannot replicate this composite logic). The decision logic has
// been preserved as a runtime-evaluable CDI bean; callers that previously used @Conditional must
// inject this bean and guard their behavior at runtime via matches() instead.
/** Returns {@code true} when the active deployment is genuinely on H2. */
@ApplicationScoped
public class H2SQLCondition {

    @Inject Config config;

    public H2SQLCondition() {}

    public H2SQLCondition(Config config) {
        this.config = config;
    }

    /** Evaluates the H2 deployment decision against the active configuration. */
    public boolean matches() {
        // Quarkus exposes active profiles via the "quarkus.profile" config property (comma
        // separated).
        String activeProfiles = config.getOptionalValue("quarkus.profile", String.class).orElse("");
        if (Arrays.asList(activeProfiles.split(",")).contains("saas")) {
            return false;
        }

        // Legacy custom-DB block, if explicitly enabled, is authoritative.
        boolean enableCustomDatabase =
                config.getOptionalValue("system.datasource.enableCustomDatabase", Boolean.class)
                        .orElse(false);
        if (enableCustomDatabase) {
            String dataSourceType =
                    config.getOptionalValue("system.datasource.type", String.class).orElse("");
            return "h2".equalsIgnoreCase(dataSourceType);
        }

        String springDsUrl =
                config.getOptionalValue("spring.datasource.url", String.class).orElse("");
        if (springDsUrl == null || springDsUrl.isBlank()) {
            return true;
        }
        return springDsUrl.startsWith("jdbc:h2:");
    }
}
