package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Constructor;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;

import stirling.software.proprietary.security.configuration.DatabaseConfig;

/**
 * {@link DatabaseConfig} carries no profile of its own, so its constructor runs under saas even
 * though the datasource it builds is {@code @Profile("!saas")}. Every bean it injects by name
 * therefore has to exist here too, or the saas context does not start at all.
 *
 * <p>Neither config class can see this alone: a unit test on {@link SaasLicenseOverride} calls its
 * own methods and passes whatever is missing, and the self-hosted side has the bean by definition.
 * Reading the requirement off the consumer is the cheap version of booting a saas context.
 *
 * <p>Deliberately not a comparison of the two config classes' whole bean sets. Some beans are
 * looked up defensively ({@code SSOAutoLogin} via {@code containsBean}) and are meant to be absent
 * under saas; only what is injected unconditionally is a boot requirement.
 */
class SaasLicenseBeanCoverageTest {

    private static Set<String> publishedBySaas() {
        return Arrays.stream(SaasLicenseOverride.class.getDeclaredMethods())
                .map(m -> m.getAnnotation(Bean.class))
                .filter(b -> b != null && b.name().length > 0)
                .map(b -> b.name()[0])
                .collect(Collectors.toSet());
    }

    private static List<String> qualifiersRequiredBy(Class<?> consumer) {
        Constructor<?> ctor = consumer.getDeclaredConstructors()[0];
        return Arrays.stream(ctor.getParameterAnnotations())
                .flatMap(Arrays::stream)
                .filter(Qualifier.class::isInstance)
                .map(a -> ((Qualifier) a).value())
                .filter(v -> !v.isEmpty())
                .toList();
    }

    @Test
    @DisplayName("saas publishes every bean DatabaseConfig injects by name")
    void saasCoversWhatDatabaseConfigInjects() {
        List<String> required = qualifiersRequiredBy(DatabaseConfig.class);

        assertThat(required).isNotEmpty(); // the test is worthless if reflection finds nothing
        assertThat(publishedBySaas()).containsAll(required);
    }
}
