package stirling.software.SPDF.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

@Controller
@Tag(name = "Security", description = "Security APIs")
public class SecurityWebController {

    @Deprecated
    // @GetMapping("/auto-redact")
    @Hidden
    public String autoRedactForm(Model model) {
        model.addAttribute("currentPage", "auto-redact");
        return "security/auto-redact";
    }

    @Deprecated
    // @GetMapping("/redact")
    public String redactForm(Model model) {
        model.addAttribute("currentPage", "redact");
        return "security/redact";
    }

    @Deprecated
    // @GetMapping("/add-password")
    @Hidden
    public String addPasswordForm(Model model) {
        model.addAttribute("currentPage", "add-password");
        return "security/add-password";
    }

    @Deprecated
    // @GetMapping("/change-permissions")
    @Hidden
    public String permissionsForm(Model model) {
        model.addAttribute("currentPage", "change-permissions");
        return "security/change-permissions";
    }

    @Deprecated
    // @GetMapping("/remove-password")
    @Hidden
    public String removePasswordForm(Model model) {
        model.addAttribute("currentPage", "remove-password");
        return "security/remove-password";
    }

    @Deprecated
    // @GetMapping("/add-watermark")
    @Hidden
    public String addWatermarkForm(Model model) {
        model.addAttribute("currentPage", "add-watermark");
        return "security/add-watermark";
    }

    @Deprecated
    // @GetMapping("/cert-sign")
    @Hidden
    public String certSignForm(Model model) {
        model.addAttribute("currentPage", "cert-sign");
        return "security/cert-sign";
    }

    @Deprecated
    // @GetMapping("/validate-signature")
    @Hidden
    public String certSignVerifyForm(Model model) {
        model.addAttribute("currentPage", "validate-signature");
        return "security/validate-signature";
    }

    @Deprecated
    // @GetMapping("/remove-cert-sign")
    @Hidden
    public String certUnSignForm(Model model) {
        model.addAttribute("currentPage", "remove-cert-sign");
        return "security/remove-cert-sign";
    }

    @Deprecated
    // @GetMapping("/sanitize-pdf")
    @Hidden
    public String sanitizeForm(Model model) {
        model.addAttribute("currentPage", "sanitize-pdf");
        return "security/sanitize-pdf";
    }

    @Deprecated
    // @GetMapping("/get-info-on-pdf")
    @Hidden
    public String getInfo(Model model) {
        model.addAttribute("currentPage", "get-info-on-pdf");
        return "security/get-info-on-pdf";
    }
}
