package stirling.software.SPDF.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class MultiToolController {

    private static final Logger logger = LoggerFactory.getLogger(MultiToolController.class);

    @GetMapping("/multi-tool")
    public String multiToolForm(Model model) {
        model.addAttribute("currentPage", "multi-tool");
        return "multi-tool";
    }

}