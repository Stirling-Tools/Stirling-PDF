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
    void returnsFalse_whenEnableCustomDatabase_missing_or_false() {
        // missing -> parseBoolean(null) = false
        assertFalse(eval(new MockEnvironment()), "Missing flag should be treated as false");

        // explicitly false (even if type=h2)
        MockEnvironment envFalse =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "false")
                        .withProperty("system.datasource.type", "h2");
        assertFalse(eval(envFalse), "Flag=false must short-circuit to false even if type=h2");
    }

    @Test
    void returnsTrue_whenEnabled_and_type_is_h2_caseInsensitive() {
        MockEnvironment env =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "true")
                        .withProperty("system.datasource.type", "h2");
        assertTrue(eval(env));

        MockEnvironment envUpper =
                new MockEnvironment()
                        .withProperty("system.datasource.enableCustomDatabase", "true")
                        .withProperty("system.datasource.type", "H2");
        assertTrue(eval(envUpper));
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
