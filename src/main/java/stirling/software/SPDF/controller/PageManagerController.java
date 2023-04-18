package stirling.software.SPDF.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageManagerController {

	private static final Logger logger = LoggerFactory.getLogger(PageManagerController.class);

	@GetMapping("/page-manager")
	public String hello(Model model) {
		model.addAttribute("currentPage", "page-manager");
		return "page-manager";
	}

}