package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.ui.ExtendedModelMap;
import org.springframework.ui.Model;
import org.springframework.web.servlet.ModelAndView;

@DisplayName("ErrorUtils Tests")
public class ErrorUtilsTest {

    @Nested
    @DisplayName("Exception to Model Tests")
    class ExceptionToModelTests {

        @Test
        @DisplayName("Adds exception message and stack trace to Model")
        public void testExceptionToModel() {
            // Create a mock Model
            Model model = new ExtendedModelMap();

            // Create a test exception
            Exception ex = new Exception("Test Exception");

            // Call the method under test
            Model resultModel = ErrorUtils.exceptionToModel(model, ex);

            // Verify the result
            assertNotNull(resultModel, "Resulting model should not be null");
            assertEquals("Test Exception", resultModel.getAttribute("errorMessage"),
                "Error message should match the exception message");
            assertNotNull(resultModel.getAttribute("stackTrace"),
                "Stack trace should be present in the model");
        }
    }

    @Nested
    @DisplayName("Exception to ModelAndView Tests")
    class ExceptionToModelViewTests {

        @Test
        @DisplayName("Adds exception message and stack trace to ModelAndView")
        public void testExceptionToModelView() {
            // Create a mock Model
            Model model = new ExtendedModelMap();

            // Create a test exception
            Exception ex = new Exception("Test Exception");

            // Call the method under test
            ModelAndView modelAndView = ErrorUtils.exceptionToModelView(model, ex);

            // Verify the result
            assertNotNull(modelAndView, "ModelAndView should not be null");
            assertEquals("Test Exception", modelAndView.getModel().get("errorMessage"),
                "Error message should match the exception message");
            assertNotNull(modelAndView.getModel().get("stackTrace"),
                "Stack trace should be present in the ModelAndView");
        }
    }
}
