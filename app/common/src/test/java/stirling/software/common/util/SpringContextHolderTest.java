package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;

@DisplayName("SpringContextHolder Tests")
public class SpringContextHolderTest {

    private ApplicationContext mockApplicationContext;
    private SpringContextHolder contextHolder;

    @BeforeEach
    void setUp() {
        mockApplicationContext = mock(ApplicationContext.class);
        contextHolder = new SpringContextHolder();
    }

    @Nested
    @DisplayName("Initialization Tests")
    class InitializationTests {

        @Test
        @DisplayName("Returns true when ApplicationContext is set and initialized")
        void testSetApplicationContext() {
            // Act
            contextHolder.setApplicationContext(mockApplicationContext);

            // Assert
            assertTrue(SpringContextHolder.isInitialized());
        }

        @Test
        @DisplayName("Returns bean of specified type when ApplicationContext is set")
        void testGetBean_ByType() {
            // Arrange
            contextHolder.setApplicationContext(mockApplicationContext);
            TestBean expectedBean = new TestBean();
            when(mockApplicationContext.getBean(TestBean.class)).thenReturn(expectedBean);

            // Act
            TestBean result = SpringContextHolder.getBean(TestBean.class);

            // Assert
            assertSame(expectedBean, result, "Should return the expected bean instance");
            verify(mockApplicationContext).getBean(TestBean.class);
        }

        @Test
        @DisplayName("Returns null when ApplicationContext is not set")
        void testGetBean_ApplicationContextNotSet() {
            // Act
            TestBean result = SpringContextHolder.getBean(TestBean.class);

            // Assert
            assertNull(result, "Should return null when ApplicationContext is not set");
        }

        @Test
        @DisplayName("Returns null when bean is not found in ApplicationContext")
        void testGetBean_BeanNotFound() {
            // Arrange
            contextHolder.setApplicationContext(mockApplicationContext);
            when(mockApplicationContext.getBean(TestBean.class))
                    .thenThrow(new org.springframework.beans.BeansException("Bean not found") {});

            // Act
            TestBean result = SpringContextHolder.getBean(TestBean.class);

            // Assert
            assertNull(result, "Should return null when bean is not found");
        }
    }

    // Simple test class
    private static class TestBean {}
}
