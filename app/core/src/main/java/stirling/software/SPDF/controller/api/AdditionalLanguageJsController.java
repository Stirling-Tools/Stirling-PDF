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

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.service.LanguageService;

@RestController
@RequestMapping("/js")
@RequiredArgsConstructor
public class AdditionalLanguageJsController {

    private final LanguageService languageService;

    @Hidden
    @GetMapping(value = "/additionalLanguageCode.js", produces = "application/javascript")
    public void generateAdditionalLanguageJs(HttpServletResponse response) throws IOException {
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        response.setContentType("application/javascript");
        PrintWriter writer = response.getWriter();
        // Erstelle das JavaScript dynamisch
        writer.println(
                "const supportedLanguages = "
                        + toJsonArray(new ArrayList<>(supportedLanguages))
                        + ";");
        // Generiere die `getDetailedLanguageCode`-Funktion
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
        writer.flush();
    }

    // Hilfsfunktion zum Konvertieren der Liste in ein JSON-Array
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
