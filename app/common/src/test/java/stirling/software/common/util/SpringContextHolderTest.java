package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import io.quarkus.arc.Arc;
import io.quarkus.arc.ArcContainer;
import io.quarkus.arc.InjectableInstance;

/**
 * MIGRATION (Spring -&gt; Quarkus): {@code SpringContextHolder} now resolves beans through the Arc
 * CDI container ({@code Arc.container().select(...)} / {@code isRunning()}) instead of a Spring
 * {@code ApplicationContext}. Tests drive it by mocking the static {@code Arc.container()} entry
 * point. The Spring-only {@code setApplicationContext(...)} mutator was removed, so "container not
 * initialized" is now expressed as {@code Arc.container() == null} (or a non-running container),
 * and "bean not found" as an unresolvable {@link InjectableInstance}.
 *
 * <p>Every collaborator mock is fully built into a local before it is handed to {@code thenReturn},
 * so a helper's own stubbing never nests inside an in-progress {@code when(...)} (which would trip
 * {@code UnfinishedStubbingException}).
 */
class SpringContextHolderTest {

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

    private static ArcContainer runningContainer() {
        ArcContainer container = mock(ArcContainer.class);
        when(container.isRunning()).thenReturn(true);
        return container;
    }

    private static <T> ArcContainer runningContainerSelecting(
            Class<T> type, InjectableInstance<T> instance) {
        ArcContainer container = mock(ArcContainer.class);
        when(container.isRunning()).thenReturn(true);
        when(container.select(type)).thenReturn(instance);
        return container;
    }

    @Test
    void isInitialized_whenContainerRunning_returnsTrue() {
        ArcContainer container = runningContainer();
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(container);
            assertTrue(SpringContextHolder.isInitialized());
        }
    }

    @Test
    void isInitialized_whenNoContainer_returnsFalse() {
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(null);
            assertFalse(SpringContextHolder.isInitialized());
        }
    }

    @Test
    void getBean_byType_whenBeanExists_returnsBean() {
        TestBean expectedBean = new TestBean();
        ArcContainer container =
                runningContainerSelecting(TestBean.class, resolvable(expectedBean));
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(container);
            assertSame(expectedBean, SpringContextHolder.getBean(TestBean.class));
        }
    }

    @Test
    void getBean_byType_whenContainerNotInitialized_returnsNull() {
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(null);
            assertNull(SpringContextHolder.getBean(TestBean.class));
        }
    }

    @Test
    void getBean_byType_whenBeanNotResolvable_returnsNull() {
        ArcContainer container = runningContainerSelecting(TestBean.class, unresolvable());
        try (MockedStatic<Arc> arc = mockStatic(Arc.class)) {
            arc.when(Arc::container).thenReturn(container);
            assertNull(SpringContextHolder.getBean(TestBean.class));
        }
    }

    // Simple test class
    private static class TestBean {}
}
