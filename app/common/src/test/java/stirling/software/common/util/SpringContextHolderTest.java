package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;

class SpringContextHolderTest {

    private ApplicationContext mockApplicationContext;
    private SpringContextHolder contextHolder;

    @BeforeEach
    void setUp() {
        mockApplicationContext = mock(ApplicationContext.class);
        contextHolder = new SpringContextHolder();
    }

    @Test
    void testSetApplicationContext() {
        // Act
        contextHolder.setApplicationContext(mockApplicationContext);

        // Assert
        assertTrue(SpringContextHolder.isInitialized());
    }

    @Test
    void testGetBean_ByType() {
        // Arrange
        contextHolder.setApplicationContext(mockApplicationContext);
        TestBean expectedBean = new TestBean();
        when(mockApplicationContext.getBean(TestBean.class)).thenReturn(expectedBean);

        // Act
        TestBean result = SpringContextHolder.getBean(TestBean.class);

        // Assert
        assertSame(expectedBean, result);
        verify(mockApplicationContext).getBean(TestBean.class);
    }

    @Test
    void testGetBean_ApplicationContextNotSet() {
        // Don't set application context

        // Act
        TestBean result = SpringContextHolder.getBean(TestBean.class);

        // Assert
        assertNull(result);
    }

    @Test
    void testGetBean_BeanNotFound() {
        // Arrange
        contextHolder.setApplicationContext(mockApplicationContext);
        when(mockApplicationContext.getBean(TestBean.class))
                .thenThrow(new org.springframework.beans.BeansException("Bean not found") {});

        // Act
        TestBean result = SpringContextHolder.getBean(TestBean.class);

        // Assert
        assertNull(result);
    }

    // Simple test class
    private static class TestBean {}
}
