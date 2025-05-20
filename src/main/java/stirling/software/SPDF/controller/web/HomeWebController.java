package stirling.software.SPDF.controller.web;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.Dependency;

@Controller
@Slf4j
@RequiredArgsConstructor
public class HomeWebController {

    private final ApplicationProperties applicationProperties;

    @GetMapping("/about")
    @Hidden
    public String gameForm(Model model) {
        model.addAttribute("currentPage", "about");
        return "about";
    }

    @GetMapping("/licenses")
    @Hidden
    public String licensesForm(Model model) {
        model.addAttribute("currentPage", "licenses");
        Resource resource = new ClassPathResource("static/3rdPartyLicenses.json");
        try {
            InputStream is = resource.getInputStream();
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            ObjectMapper mapper = new ObjectMapper();
            Map<String, List<Dependency>> data =
                    mapper.readValue(json, new TypeReference<Map<String, List<Dependency>>>() {});
            model.addAttribute("dependencies", data.get("dependencies"));
        } catch (IOException e) {
            log.error("exception", e);
        }
        return "licenses";
    }

    @GetMapping("/releases")
    public String getReleaseNotes(Model model) {
        return "releases";
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("currentPage", "home");
        String showSurvey = System.getenv("SHOW_SURVEY");
        boolean showSurveyValue = showSurvey == null || "true".equalsIgnoreCase(showSurvey);
        model.addAttribute("showSurveyFromDocker", showSurveyValue);
        return "home";
    }

    @GetMapping("/home")
    public String root(Model model) {
        return "redirect:/";
    }

    @GetMapping("/home-legacy")
    public String redirectHomeLegacy() {
        return "redirect:/";
    }

    @GetMapping(value = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
    @ResponseBody
    @Hidden
    public String getRobotsTxt() {
        Boolean allowGoogle = applicationProperties.getSystem().getGooglevisibility();
        if (Boolean.TRUE.equals(allowGoogle)) {
            return "User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nAllow: /";
        } else {
            return "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /";
        }
    }
}
