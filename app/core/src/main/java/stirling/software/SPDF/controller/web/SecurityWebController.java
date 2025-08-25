package stirling.software.SPDF.controller.web;

import java.io.File;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

@Controller
@Tag(name = "Security", description = "Security APIs")
@RequiredArgsConstructor
public class SecurityWebController {

    private final ApplicationProperties applicationProperties;

    private List<String> getAvailableTesseractLanguages() {
        String tessdataDir = applicationProperties.getSystem().getTessdataDir();
        File[] files = new File(tessdataDir).listFiles();
        if (files == null) {
            return Collections.emptyList();
        }
        return Arrays.stream(files)
                .filter(file -> file.getName().endsWith(".traineddata"))
                .map(file -> file.getName().replace(".traineddata", ""))
                .filter(lang -> !"osd".equalsIgnoreCase(lang))
                .sorted()
                .toList();
    }

    @GetMapping("/auto-redact")
    @Hidden
    public String autoRedactForm(Model model) {
        model.addAttribute("currentPage", "auto-redact");
        model.addAttribute("languages", getAvailableTesseractLanguages());
        return "security/auto-redact";
    }

    @GetMapping("/redact")
    public String redactForm(Model model) {
        model.addAttribute("currentPage", "redact");
        return "security/redact";
    }

    @GetMapping("/add-password")
    @Hidden
    public String addPasswordForm(Model model) {
        model.addAttribute("currentPage", "add-password");
        return "security/add-password";
    }

    @GetMapping("/change-permissions")
    @Hidden
    public String permissionsForm(Model model) {
        model.addAttribute("currentPage", "change-permissions");
        return "security/change-permissions";
    }

    @GetMapping("/remove-password")
    @Hidden
    public String removePasswordForm(Model model) {
        model.addAttribute("currentPage", "remove-password");
        return "security/remove-password";
    }

    @GetMapping("/add-watermark")
    @Hidden
    public String addWatermarkForm(Model model) {
        model.addAttribute("currentPage", "add-watermark");
        return "security/add-watermark";
    }

    @GetMapping("/cert-sign")
    @Hidden
    public String certSignForm(Model model) {
        model.addAttribute("currentPage", "cert-sign");
        return "security/cert-sign";
    }

    @GetMapping("/validate-signature")
    @Hidden
    public String certSignVerifyForm(Model model) {
        model.addAttribute("currentPage", "validate-signature");
        return "security/validate-signature";
    }

    @GetMapping("/remove-cert-sign")
    @Hidden
    public String certUnSignForm(Model model) {
        model.addAttribute("currentPage", "remove-cert-sign");
        return "security/remove-cert-sign";
    }

    @GetMapping("/sanitize-pdf")
    @Hidden
    public String sanitizeForm(Model model) {
        model.addAttribute("currentPage", "sanitize-pdf");
        return "security/sanitize-pdf";
    }

    @GetMapping("/get-info-on-pdf")
    @Hidden
    public String getInfo(Model model) {
        model.addAttribute("currentPage", "get-info-on-pdf");
        return "security/get-info-on-pdf";
    }
}
