package stirling.software.SPDF.utils;

import java.io.PrintWriter;
import java.io.StringWriter;

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
