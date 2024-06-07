package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.ui.Model;
import org.springframework.web.servlet.ModelAndView;

public class ErrorUtilsTest {

    @Test
    public void testExceptionToModel() {
        // Create a mock Model
        Model model = new org.springframework.ui.ExtendedModelMap();

        // Create a test exception
        Exception ex = new Exception("Test Exception");

        // Call the method under test
        Model resultModel = ErrorUtils.exceptionToModel(model, ex);

        // Verify the result
        assertNotNull(resultModel);
        assertEquals("Test Exception", resultModel.getAttribute("errorMessage"));
        assertNotNull(resultModel.getAttribute("stackTrace"));
    }

    @Test
    public void testExceptionToModelView() {
        // Create a mock Model
        Model model = new org.springframework.ui.ExtendedModelMap();

        // Create a test exception
        Exception ex = new Exception("Test Exception");

        // Call the method under test
        ModelAndView modelAndView = ErrorUtils.exceptionToModelView(model, ex);

        // Verify the result
        assertNotNull(modelAndView);
        assertEquals("Test Exception", modelAndView.getModel().get("errorMessage"));
        assertNotNull(modelAndView.getModel().get("stackTrace"));
    }
}
