package stirling.software.SPDF.config;

import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.service.TranslationService;

/**
 * Global controller advice that adds common model attributes to all templates. Makes translation
 * service available for client-side error message translation.
 */
@ControllerAdvice
@RequiredArgsConstructor
public class GlobalModelAdvice {

    private final TranslationService translationService;

    /** Add error messages to all templates for frontend translation support. */
    @ModelAttribute
    public void addErrorMessages(Model model) {
        model.addAttribute("errorMessages", translationService.getErrorMessages());
    }
}
