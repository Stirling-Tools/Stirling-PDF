package stirling.software.proprietary.security.database;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.util.Optional;

import org.eclipse.microprofile.config.Config;
import org.junit.jupiter.api.Test;

/**
 * MIGRATION (Spring -> Quarkus): {@code H2SQLCondition} was a Spring {@code
 * org.springframework.context.annotation.Condition} evaluated via {@code matches(ConditionContext,
 * AnnotatedTypeMetadata)} against a Spring {@code Environment}. Quarkus has no runtime
 * {@code @Conditional}; the decision logic is now a CDI bean with a no-arg {@code matches()} that
 * reads MicroProfile {@link Config} directly. The property keys ({@code
 * system.datasource.enableCustomDatabase}, {@code system.datasource.type}) and the H2 decision are
 * unchanged, so the original cases are preserved against the new {@code Config}-backed signature.
 *
 * <p>Note: with the custom-database block disabled (or its flag missing), the new logic falls
 * through to {@code spring.datasource.url}; an unset URL means "on H2" -> {@code true}, matching
 * the old behaviour for those cases.
 */
class H2SQLConditionTest {

    private boolean eval(String enableCustomDatabase, String datasourceType) {
        Config config = mock(Config.class);
        // No active profile (so the saas short-circuit does not fire).
        lenient()
                .when(config.getOptionalValue("quarkus.profile", String.class))
                .thenReturn(Optional.of(""));
        lenient()
                .when(
                        config.getOptionalValue(
                                "system.datasource.enableCustomDatabase", Boolean.class))
                .thenReturn(
                        enableCustomDatabase == null
                                ? Optional.empty()
                                : Optional.of(Boolean.valueOf(enableCustomDatabase)));
        lenient()
                .when(config.getOptionalValue("system.datasource.type", String.class))
                .thenReturn(
                        datasourceType == null ? Optional.empty() : Optional.of(datasourceType));
        // Unset legacy Spring datasource URL -> the "no custom DB" branch treats this as H2.
        lenient()
                .when(config.getOptionalValue("spring.datasource.url", String.class))
                .thenReturn(Optional.of(""));
        return new H2SQLCondition(config).matches();
    }

    @Test
    void returnsTrue_whenDisabledOrMissing_and_typeIsH2_caseInsensitive() {
        // Flag missing, type=h2 -> true
        assertTrue(eval(null, "h2"));
        // Flag=false, type=H2 -> true
        assertTrue(eval("false", "H2"));
    }

    @Test
    void returnsTrue_whenEnableCustomDatabase_true_andTypeIsH2() {
        // Flag=true, type=h2 -> true
        assertTrue(eval("true", "h2"));
    }

    @Test
    void returnsFalse_whenEnabled_but_type_not_h2_or_missing() {
        assertFalse(eval("true", "postgresql"));
        assertFalse(eval("true", null));
    }

    @Test
    void returnsTrue_whenTypeNotH2_andCustomDatabaseDisabled() {
        // With the custom-DB block disabled, the type is irrelevant and the unset legacy URL
        // resolves to H2 -> true.
        assertTrue(eval("false", "postgresql"));
        assertTrue(eval("false", null));
    }
}
