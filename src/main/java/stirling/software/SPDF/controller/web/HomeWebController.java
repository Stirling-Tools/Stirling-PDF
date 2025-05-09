package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.Dependency;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class HomeWebController {

    private final ApplicationProperties applicationProperties;

    /** Returns the visibility settings for things like surveys. */
    @GetMapping("/env")
    public Map<String, Object> getEnvironmentFlags() {
        String showSurvey = System.getenv("SHOW_SURVEY");
        boolean showSurveyValue = showSurvey == null || "true".equalsIgnoreCase(showSurvey);
        return Map.of("showSurvey", showSurveyValue);
    }

    /** Returns the third-party licenses as a JSON list. */
    @GetMapping("/licenses")
    public List<Dependency> getLicenses() {
        Resource resource = new ClassPathResource("static/3rdPartyLicenses.json");
        try (InputStream is = resource.getInputStream()) {
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            ObjectMapper mapper = new ObjectMapper();
            Map<String, List<Dependency>> data = mapper.readValue(json, new TypeReference<>() {});
            return data.get("dependencies");
        } catch (IOException e) {
            log.error("Failed to read licenses JSON", e);
            throw new RuntimeException("Could not load license data", e);
        }
    }

    /** Dynamic generation of robots.txt based on configuration. */
    @GetMapping(value = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
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
