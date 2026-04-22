package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.context.ApplicationContext;

class ApplicationContextProviderTest {

    private ApplicationContextProvider provider;

    @BeforeEach
    void setUp() {
        provider = new ApplicationContextProvider();
        // Reset to null state
        provider.setApplicationContext(null);
    }

    @AfterEach
    void tearDown() {
        // Clean up static state
        provider.setApplicationContext(null);
    }

    @Test
    void getBean_byClass_whenNoContext_returnsNull() {
        provider.setApplicationContext(null);
        assertNull(ApplicationContextProvider.getBean(String.class));
    }

    @Test
    void getBean_byClass_whenBeanExists_returnsBean() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBean(String.class)).thenReturn("hello");
        provider.setApplicationContext(ctx);
        assertEquals("hello", ApplicationContextProvider.getBean(String.class));
    }

    @Test
    void getBean_byClass_whenBeanNotFound_returnsNull() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBean(String.class)).thenThrow(new NoSuchBeanDefinitionException(""));
        provider.setApplicationContext(ctx);
        assertNull(ApplicationContextProvider.getBean(String.class));
    }

    @Test
    void getBean_byNameAndClass_whenNoContext_returnsNull() {
        provider.setApplicationContext(null);
        assertNull(ApplicationContextProvider.getBean("myBean", String.class));
    }

    @Test
    void getBean_byNameAndClass_whenBeanExists_returnsBean() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBean("myBean", String.class)).thenReturn("world");
        provider.setApplicationContext(ctx);
        assertEquals("world", ApplicationContextProvider.getBean("myBean", String.class));
    }

    @Test
    void getBean_byNameAndClass_whenBeanNotFound_returnsNull() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBean("missing", String.class)).thenThrow(new NoSuchBeanDefinitionException(""));
        provider.setApplicationContext(ctx);
        assertNull(ApplicationContextProvider.getBean("missing", String.class));
    }

    @Test
    void containsBean_whenNoContext_returnsFalse() {
        provider.setApplicationContext(null);
        assertFalse(ApplicationContextProvider.containsBean(String.class));
    }

    @Test
    void containsBean_whenBeanExists_returnsTrue() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBean(String.class)).thenReturn("exists");
        provider.setApplicationContext(ctx);
        assertTrue(ApplicationContextProvider.containsBean(String.class));
    }

    @Test
    void containsBean_whenBeanNotFound_returnsFalse() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBean(Integer.class)).thenThrow(new NoSuchBeanDefinitionException(""));
        provider.setApplicationContext(ctx);
        assertFalse(ApplicationContextProvider.containsBean(Integer.class));
    }

    @Test
    void setApplicationContext_updatesStaticContext() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBean(String.class)).thenReturn("test");
        provider.setApplicationContext(ctx);
        assertEquals("test", ApplicationContextProvider.getBean(String.class));

        // Now set a different context
        ApplicationContext ctx2 = mock(ApplicationContext.class);
        when(ctx2.getBean(String.class)).thenReturn("updated");
        provider.setApplicationContext(ctx2);
        assertEquals("updated", ApplicationContextProvider.getBean(String.class));
    }
}
