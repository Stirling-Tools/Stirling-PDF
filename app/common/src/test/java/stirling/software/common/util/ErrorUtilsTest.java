package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.ui.Model;
import org.springframework.web.servlet.ModelAndView;

class ErrorUtilsTest {

    @Nested
    @DisplayName("exceptionToModel")
    class ExceptionToModelTests {

        @Test
        @DisplayName("should add error message to model")
        void addsErrorMessage() {
            Model model = mock(Model.class);
            Exception ex = new RuntimeException("test error");

            ErrorUtils.exceptionToModel(model, ex);

            verify(model).addAttribute("errorMessage", "test error");
        }

        @Test
        @DisplayName("should add stack trace to model")
        void addsStackTrace() {
            Model model = mock(Model.class);
            Exception ex = new RuntimeException("test error");

            ErrorUtils.exceptionToModel(model, ex);

            verify(model)
                    .addAttribute(
                            eq("stackTrace"),
                            argThat(
                                    arg ->
                                            arg instanceof String s
                                                    && s.contains("RuntimeException")
                                                    && s.contains("test error")));
        }

        @Test
        @DisplayName("should return the same model instance")
        void returnsSameModel() {
            Model model = mock(Model.class);
            Exception ex = new RuntimeException("test");

            Model result = ErrorUtils.exceptionToModel(model, ex);

            assertSame(model, result);
        }

        @Test
        @DisplayName("should handle exception with null message")
        void nullExceptionMessage() {
            Model model = mock(Model.class);
            Exception ex = new RuntimeException((String) null);

            ErrorUtils.exceptionToModel(model, ex);

            verify(model).addAttribute("errorMessage", null);
        }
    }

    @Nested
    @DisplayName("exceptionToModelView")
    class ExceptionToModelViewTests {

        @Test
        @DisplayName("should create ModelAndView with error message")
        void addsErrorMessage() {
            Model model = mock(Model.class);
            Exception ex = new RuntimeException("view error");

            ModelAndView result = ErrorUtils.exceptionToModelView(model, ex);

            assertNotNull(result);
            assertEquals("view error", result.getModel().get("errorMessage"));
        }

        @Test
        @DisplayName("should create ModelAndView with stack trace")
        void addsStackTrace() {
            Model model = mock(Model.class);
            Exception ex = new RuntimeException("view error");

            ModelAndView result = ErrorUtils.exceptionToModelView(model, ex);

            String stackTrace = (String) result.getModel().get("stackTrace");
            assertNotNull(stackTrace);
            assertTrue(stackTrace.contains("RuntimeException"));
            assertTrue(stackTrace.contains("view error"));
        }

        @Test
        @DisplayName("should handle nested exception")
        void nestedException() {
            Model model = mock(Model.class);
            Exception cause = new IllegalArgumentException("root cause");
            Exception ex = new RuntimeException("wrapper", cause);

            ModelAndView result = ErrorUtils.exceptionToModelView(model, ex);

            String stackTrace = (String) result.getModel().get("stackTrace");
            assertTrue(stackTrace.contains("root cause"));
            assertEquals("wrapper", result.getModel().get("errorMessage"));
        }
    }
}
