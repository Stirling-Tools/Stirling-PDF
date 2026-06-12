package stirling.software.common.util;

import java.io.PrintWriter;
import java.io.StringWriter;

// TODO: Migration required - org.springframework.ui.Model and
// org.springframework.web.servlet.ModelAndView are Spring MVC view-layer types with no
// Quarkus/Jakarta (JAX-RS) drop-in equivalent. The public method signatures accept Model and
// return Model/ModelAndView, so converting them would ripple into every caller and the view/
// template layer. Per migration rules, the original types and logic are kept intact pending a
// dedicated view-layer migration (e.g. to Qute templates / a plain Map model holder).
import org.springframework.ui.Model;
import org.springframework.web.servlet.ModelAndView;

public class ErrorUtils {

    public static Model exceptionToModel(Model model, Exception ex) {
        StringWriter sw = new StringWriter();
        ex.printStackTrace(new PrintWriter(sw));
        String stackTrace = sw.toString();

        model.addAttribute("errorMessage", ex.getMessage());
        model.addAttribute("stackTrace", stackTrace);
        return model;
    }

    public static ModelAndView exceptionToModelView(Model model, Exception ex) {
        StringWriter sw = new StringWriter();
        ex.printStackTrace(new PrintWriter(sw));
        String stackTrace = sw.toString();

        ModelAndView modelAndView = new ModelAndView();
        modelAndView.addObject("errorMessage", ex.getMessage());
        modelAndView.addObject("stackTrace", stackTrace);
        return modelAndView;
    }
}
