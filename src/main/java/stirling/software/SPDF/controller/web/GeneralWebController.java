package stirling.software.SPDF.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import io.swagger.v3.oas.annotations.Hidden;

@Controller
public class GeneralWebController {
    @GetMapping("/merge-pdfs")
    @Hidden
    public String mergePdfForm(Model model) {
        model.addAttribute("currentPage", "merge-pdfs");
        return "merge-pdfs";
    }
    @GetMapping("/about")
    @Hidden
    public String gameForm(Model model) {
        model.addAttribute("currentPage", "about");
        return "about";
    }
    
    @GetMapping("/multi-tool")
    @Hidden
    public String multiToolForm(Model model) {
        model.addAttribute("currentPage", "multi-tool");
        return "multi-tool";
    }
    
    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("currentPage", "home");
        return "home";
    }

    @GetMapping("/home")
    public String root(Model model) {
        return "redirect:/";
    }
    
    @GetMapping("/remove-pages")
    @Hidden
    public String pageDeleter(Model model) {
        model.addAttribute("currentPage", "remove-pages");
        return "remove-pages";
    }
    
    @GetMapping("/pdf-organizer")
    @Hidden
    public String pageOrganizer(Model model) {
        model.addAttribute("currentPage", "pdf-organizer");
        return "pdf-organizer";
    }
    
    @GetMapping("/rotate-pdf")
    @Hidden
    public String rotatePdfForm(Model model) {
        model.addAttribute("currentPage", "rotate-pdf");
        return "rotate-pdf";
    }
    
    @GetMapping("/split-pdfs")
    @Hidden
    public String splitPdfForm(Model model) {
        model.addAttribute("currentPage", "split-pdfs");
        return "split-pdfs";
    }
    
    
    
    
    @GetMapping("/sign")
    @Hidden
    public String signForm(Model model) {
        model.addAttribute("currentPage", "sign");
        return "sign";
    }
    
}
