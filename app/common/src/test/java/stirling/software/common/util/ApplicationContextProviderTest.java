package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import io.quarkus.arc.Arc;
import io.quarkus.arc.ArcContainer;
import io.quarkus.arc.InjectableInstance;

import jakarta.enterprise.inject.literal.NamedLiteral;

/**
 * MIGRATION (Spring -&gt; Quarkus): {@code ApplicationContextProvider} now resolves beans through
 * the Arc CDI container ({@code Arc.container().select(...)}) instead of a Spring {@code
 * ApplicationContext}. Tests drive it by mocking the static {@code Arc.container()} entry point;
 * the "no container" state (a non-{@code @QuarkusTest} unit test) is simulated by stubbing {@code
 * Arc.container()} to {@code null}, and "bean not found" by an unresolvable {@link
 * InjectableInstance}. The Spring-only {@code setApplicationContext(...)} mutator was removed, so
 * the former context-swap test no longer applies.
 *
 * <p>Every collaborator mock is fully built into a local before it is handed to {@code thenReturn},
 * so a helper's own stubbing never nests inside an in-progress {@code when(...)} (which would trip
 * {@code UnfinishedStubbingException}).
 */
class ApplicationContextProviderTest {

    @SuppressWarnings("unchecked")
    private static <T> InjectableInstance<T> resolvable(T bean) {
        InjectableInstance<T> instance = mock(InjectableInstance.class);
        when(instance.isResolvable()).thenReturn(true);
        when(instance.get()).thenReturn(bean);
        return instance;
    }

    @SuppressWarnings("unchecked")
    private static <T> InjectableInstance<T> unresolvable() {
        InjectableInstance<T> instance = mock(InjectableInstance.class);
        when(instance.isResolvable()).thenReturn(false);
        return instance;
    }

    private static <T> ArcContainer containerSelecting(
            Class<T> type, InjectableInstance<T> instance) {
        ArcContainer container = mock(ArcContainer.class);
        when(container.select(type)).thenReturn(instance);
        return container;
    }

    private static <T> ArcContainer containerSelectingNamed(
            Class<T> type, String name, InjectableInstance<T> instance) {
        ArcContainer container = mock(ArcContainer.class);
        when(container.select(type, NamedLiteral.of(name))).thenReturn(instance);
        return container;
    }

    @Test
    void getBean_byClass_whenNoContainer_returnsNull() {
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(null);
            assertNull(ApplicationContextProvider.getBean(String.class));
        }
    }

    @Test
    void getBean_byClass_whenBeanExists_returnsBean() {
        ArcContainer container = containerSelecting(String.class, resolvable("hello"));
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(container);
            assertEquals("hello", ApplicationContextProvider.getBean(String.class));
        }
    }

    @Test
    void getBean_byClass_whenBeanNotFound_returnsNull() {
        ArcContainer container = containerSelecting(String.class, unresolvable());
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(container);
            assertNull(ApplicationContextProvider.getBean(String.class));
        }
    }

    @Test
    void getBean_byNameAndClass_whenNoContainer_returnsNull() {
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(null);
            assertNull(ApplicationContextProvider.getBean("myBean", String.class));
        }
    }

    @Test
    void getBean_byNameAndClass_whenBeanExists_returnsBean() {
        ArcContainer container =
                containerSelectingNamed(String.class, "myBean", resolvable("world"));
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(container);
            assertEquals("world", ApplicationContextProvider.getBean("myBean", String.class));
        }
    }

    @Test
    void getBean_byNameAndClass_whenBeanNotFound_returnsNull() {
        ArcContainer container = containerSelectingNamed(String.class, "missing", unresolvable());
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(container);
            assertNull(ApplicationContextProvider.getBean("missing", String.class));
        }
    }

    @Test
    void containsBean_whenNoContainer_returnsFalse() {
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(null);
            assertFalse(ApplicationContextProvider.containsBean(String.class));
        }
    }

    @Test
    void containsBean_whenBeanExists_returnsTrue() {
        ArcContainer container = containerSelecting(String.class, resolvable("exists"));
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(container);
            assertTrue(ApplicationContextProvider.containsBean(String.class));
        }
    }

    @Test
    void containsBean_whenBeanNotFound_returnsFalse() {
        ArcContainer container = containerSelecting(Integer.class, unresolvable());
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(container);
            assertFalse(ApplicationContextProvider.containsBean(Integer.class));
        }
    }
}
