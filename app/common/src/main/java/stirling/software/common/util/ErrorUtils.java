package stirling.software.common.util;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.HashMap;
import java.util.Map;

public class ErrorUtils {

    public static Map<String, Object> exceptionToModel(Map<String, Object> model, Exception ex) {
        StringWriter sw = new StringWriter();
        ex.printStackTrace(new PrintWriter(sw));
        String stackTrace = sw.toString();

        model.put("errorMessage", ex.getMessage());
        model.put("stackTrace", stackTrace);
        return model;
    }

    public static Map<String, Object> exceptionToModelView(
            Map<String, Object> model, Exception ex) {
        StringWriter sw = new StringWriter();
        ex.printStackTrace(new PrintWriter(sw));
        String stackTrace = sw.toString();

        Map<String, Object> modelAndView = new HashMap<>();
        modelAndView.put("errorMessage", ex.getMessage());
        modelAndView.put("stackTrace", stackTrace);
        return modelAndView;
    }
}
