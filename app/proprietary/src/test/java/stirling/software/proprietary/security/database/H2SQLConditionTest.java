package stirling.software.proprietary.security.database;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.mock.env.MockEnvironment;

class H2SQLConditionTest {

    private final H2SQLCondition condition = new H2SQLCondition();

    private boolean eval(MockEnvironment env) {
        ConditionContext ctx = mock(ConditionContext.class);
        when(ctx.getEnvironment()).thenReturn(env);
        AnnotatedTypeMetadata md = mock(AnnotatedTypeMetadata.class);
        return condition.matches(ctx, md);
    }

    @Test
    void returnsTrue_whenDisabledOrMissing_and_typeIsH2_caseInsensitive() {
        // Flag fehlt, Typ=h2 -> true
        MockEnvironment envMissingFlag =
                new MockEnvironment().withProperty("system.datasource.type", "h2");
        assertTrue(eval(envMissingFlag));

        // Flag=false, Typ=H2 -> true
        MockEnvironment envFalseFlag =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "false")
                        .withProperty("system.datasource.type", "H2");
        assertTrue(eval(envFalseFlag));
    }

    @Test
    void returnsFalse_whenEnableCustomDatabase_true_regardlessOfType() {
        // Flag=true, Typ=h2 -> false
        MockEnvironment envTrueH2 =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "true")
                        .withProperty("system.datasource.type", "h2");
        assertFalse(eval(envTrueH2));

        // Flag=true, Typ=postgres -> false
        MockEnvironment envTrueOther =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "true")
                        .withProperty("system.datasource.type", "postgresql");
        assertFalse(eval(envTrueOther));

        // Flag=true, Typ fehlt -> false
        MockEnvironment envTrueMissingType =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "true");
        assertFalse(eval(envTrueMissingType));
    }

    @Test
    void returnsFalse_whenTypeNotH2_orMissing_andFlagNotEnabled() {
        // Flag fehlt, Typ=postgres -> false
        MockEnvironment envNotH2 =
                new MockEnvironment().withProperty("system.datasource.type", "postgresql");
        assertFalse(eval(envNotH2));

        // Flag=false, Typ fehlt -> false (Default: "")
        MockEnvironment envMissingType =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "false");
        assertFalse(eval(envMissingType));
    }

    @Test
    void returnsFalse_whenEnabled_but_type_not_h2_or_missing() {
        MockEnvironment envNotH2 =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "true")
                        .withProperty("system.datasource.type", "postgresql");
        assertFalse(eval(envNotH2));

        MockEnvironment envMissingType =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "true");
        assertFalse(eval(envMissingType));
    }
}
