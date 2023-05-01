package stirling.software.SPDF.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import io.swagger.v3.oas.annotations.Hidden;

@Controller
public class SecurityWebController {
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

    //WIP
    @GetMapping("/remove-watermark")
    @Hidden
    public String removeWatermarkForm(Model model) {
        model.addAttribute("currentPage", "remove-watermark");
        return "security/remove-watermark";
    }
    
}
