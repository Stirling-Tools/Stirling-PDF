package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.servlet.http.HttpServletResponse;

import stirling.software.SPDF.service.LanguageService;

@RestController
@RequestMapping("/js")
public class AdditionalJsController {

    private final LanguageService languageService;

    public AdditionalJsController(LanguageService languageService) {
        this.languageService = languageService;
    }

    @Hidden
    @GetMapping(value = "/additional.js", produces = "application/javascript")
    public void generateAdditionalJs(HttpServletResponse response) throws IOException {
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        response.setContentType("application/javascript");
        PrintWriter writer = response.getWriter();
        // Dynamically generate the JavaScript
        writer.println(
                "const supportedLanguages = "
                        + toJsonArray(new ArrayList<>(supportedLanguages))
                        + ";");
        // Generate the `getDetailedLanguageCode` function
        writer.println(
                """
                function getDetailedLanguageCode() {
                    const userLanguages = navigator.languages ? navigator.languages : [navigator.language];
                    for (let lang of userLanguages) {
                        let matchedLang = supportedLanguages.find(supportedLang => supportedLang.startsWith(lang.replace('-', '_')));
                        if (matchedLang) {
                            return matchedLang;
                        }
                    }
                    // Fallback
                    return "en_GB";
                }
                """);

        writer.println(
                """
                // Pixel, doesn't collect any PII
                const trackingPixel = document.createElement('img');
                trackingPixel.src = 'https://pixel.stirlingpdf.com/a.png?x-pxid=4f5fa02f-a065-4efb-bb2c-24509a4b6b92';
                trackingPixel.style.position = 'absolute';
                trackingPixel.style.visibility = 'hidden';
                document.body.appendChild(trackingPixel);
                """);
        writer.flush();
    }

    // Helper function to convert list to JSON array
    private String toJsonArray(List<String> list) {
        StringBuilder jsonArray = new StringBuilder("[");
        for (int i = 0; i < list.size(); i++) {
            jsonArray.append("\"").append(list.get(i)).append("\"");
            if (i < list.size() - 1) {
                jsonArray.append(",");
            }
        }
        jsonArray.append("]");
        return jsonArray.toString();
    }
}
