package stirling.software.SPDF.controller.web;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import io.swagger.v3.oas.annotations.Hidden;

@Controller
public class HomeWebController {
	 
    @GetMapping("/about")
    @Hidden
    public String gameForm(Model model) {
        model.addAttribute("currentPage", "about");
        return "about";
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
    
   

    @GetMapping(value = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
    @ResponseBody
    @Hidden
    public String getRobotsTxt() {
        String allowGoogleVisibility = System.getProperty("ALLOW_GOOGLE_VISIBILITY");
        if (allowGoogleVisibility == null)
            allowGoogleVisibility = System.getenv("ALLOW_GOOGLE_VISIBILITY");
        if (allowGoogleVisibility == null)
            allowGoogleVisibility = "false";
        if (Boolean.parseBoolean(allowGoogleVisibility)) {
            return "User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nAllow: /";
        } else {
            return "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /";
        }
    }
    
}
