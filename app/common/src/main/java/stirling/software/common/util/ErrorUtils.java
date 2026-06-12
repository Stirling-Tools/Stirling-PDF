package stirling.software.common.util;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.HashMap;
import java.util.Map;

public class ErrorUtils {

    // TODO: Migration required - server-rendered error view removed; surface via JAX-RS
    // ExceptionMapper. Spring MVC org.springframework.ui.Model has no Quarkus/Jakarta (JAX-RS)
    // drop-in; the method now mutates and returns a plain Map<String, Object> model holder.
    public static Map<String, Object> exceptionToModel(Map<String, Object> model, Exception ex) {
        StringWriter sw = new StringWriter();
        ex.printStackTrace(new PrintWriter(sw));
        String stackTrace = sw.toString();

        model.put("errorMessage", ex.getMessage());
        model.put("stackTrace", stackTrace);
        return model;
    }

    // TODO: Migration required - server-rendered error view removed; surface via JAX-RS
    // ExceptionMapper. Spring MVC org.springframework.web.servlet.ModelAndView has no
    // Quarkus/Jakarta (JAX-RS) drop-in; the method now returns a plain Map<String, Object> model
    // holder instead of a ModelAndView (the incoming model parameter is retained for signature
    // compatibility but is no longer the Spring Model type).
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
