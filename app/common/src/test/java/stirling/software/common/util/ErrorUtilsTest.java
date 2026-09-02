package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * MIGRATION (Spring -> JAX-RS): the production {@code ErrorUtils} no longer depends on Spring MVC
 * {@code org.springframework.ui.Model} / {@code ModelAndView}. Both methods now take and return a
 * plain {@code Map<String, Object>} model holder. Tests updated to the new signatures while keeping
 * the original assertions about the populated keys.
 */
class ErrorUtilsTest {

    @Nested
    @DisplayName("exceptionToModel")
    class ExceptionToModelTests {

        @Test
        @DisplayName("should add error message to model")
        void addsErrorMessage() {
            Map<String, Object> model = new HashMap<>();
            Exception ex = new RuntimeException("test error");

            ErrorUtils.exceptionToModel(model, ex);

            assertEquals("test error", model.get("errorMessage"));
        }

        @Test
        @DisplayName("should add stack trace to model")
        void addsStackTrace() {
            Map<String, Object> model = new HashMap<>();
            Exception ex = new RuntimeException("test error");

            ErrorUtils.exceptionToModel(model, ex);

            Object stackTrace = model.get("stackTrace");
            assertInstanceOf(String.class, stackTrace);
            String s = (String) stackTrace;
            assertTrue(s.contains("RuntimeException"));
            assertTrue(s.contains("test error"));
        }

        @Test
        @DisplayName("should return the same model instance")
        void returnsSameModel() {
            Map<String, Object> model = new HashMap<>();
            Exception ex = new RuntimeException("test");

            Map<String, Object> result = ErrorUtils.exceptionToModel(model, ex);

            assertSame(model, result);
        }

        @Test
        @DisplayName("should handle exception with null message")
        void nullExceptionMessage() {
            Map<String, Object> model = new HashMap<>();
            Exception ex = new RuntimeException((String) null);

            ErrorUtils.exceptionToModel(model, ex);

            assertTrue(model.containsKey("errorMessage"));
            assertNull(model.get("errorMessage"));
        }
    }

    @Nested
    @DisplayName("exceptionToModelView")
    class ExceptionToModelViewTests {

        @Test
        @DisplayName("should create model holder with error message")
        void addsErrorMessage() {
            Map<String, Object> model = new HashMap<>();
            Exception ex = new RuntimeException("view error");

            Map<String, Object> result = ErrorUtils.exceptionToModelView(model, ex);

            assertNotNull(result);
            assertEquals("view error", result.get("errorMessage"));
        }

        @Test
        @DisplayName("should create model holder with stack trace")
        void addsStackTrace() {
            Map<String, Object> model = new HashMap<>();
            Exception ex = new RuntimeException("view error");

            Map<String, Object> result = ErrorUtils.exceptionToModelView(model, ex);

            String stackTrace = (String) result.get("stackTrace");
            assertNotNull(stackTrace);
            assertTrue(stackTrace.contains("RuntimeException"));
            assertTrue(stackTrace.contains("view error"));
        }

        @Test
        @DisplayName("should handle nested exception")
        void nestedException() {
            Map<String, Object> model = new HashMap<>();
            Exception cause = new IllegalArgumentException("root cause");
            Exception ex = new RuntimeException("wrapper", cause);

            Map<String, Object> result = ErrorUtils.exceptionToModelView(model, ex);

            String stackTrace = (String) result.get("stackTrace");
            assertTrue(stackTrace.contains("root cause"));
            assertEquals("wrapper", result.get("errorMessage"));
        }
    }
}
