package stirling.software.saas.store;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;

/**
 * The other store tests build their beans by hand, which is how a constructor Spring could not
 * choose shipped: the app failed to start the moment {@code stirling.store.enabled} was true. This
 * builds the text-audit beans the way the app does.
 */
class StoreBeanWiringTest {

    @Test
    void textAuditBeansWireWhenTheStoreIsEnabled() {
        try (AnnotationConfigApplicationContext context =
                new AnnotationConfigApplicationContext()) {
            context.getEnvironment()
                    .getPropertySources()
                    .addFirst(
                            new MapPropertySource(
                                    "store", Map.of("stirling.store.enabled", "true")));
            context.register(
                    BlockedWordList.class, StoreTextAuditor.class, StoreManifestSanitizer.class);
            context.refresh();

            assertThat(context.getBean(StoreTextAuditor.class)).isNotNull();
            assertThat(context.getBean(StoreManifestSanitizer.class)).isNotNull();
        }
    }

    @Test
    void theContentCheckIsOffWithoutAProviderKey() {
        try (AnnotationConfigApplicationContext context =
                new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles("saas");
            context.getEnvironment()
                    .getPropertySources()
                    .addFirst(
                            new MapPropertySource(
                                    "store", Map.of("stirling.store.enabled", "true")));
            context.register(stirling.software.saas.store.moderation.StoreModerationConfig.class);
            context.refresh();

            assertThat(
                            context.getBean(
                                            stirling.software.saas.store.moderation
                                                    .StoreContentCheck.class)
                                    .enabled())
                    .isFalse();
        }
    }
}
