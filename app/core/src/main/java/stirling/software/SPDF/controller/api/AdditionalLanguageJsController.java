package stirling.software.SPDF.controller.api;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.service.LanguageService;

@ApplicationScoped
@Path("/js")
@RequiredArgsConstructor
public class AdditionalLanguageJsController {

    private final LanguageService languageService;

    @Hidden
    @GET
    @Path("/additionalLanguageCode.js")
    @Produces("application/javascript")
    public String generateAdditionalLanguageJs() {
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        StringBuilder writer = new StringBuilder();
        // Erstelle das JavaScript dynamisch
        writer.append("const supportedLanguages = ")
                .append(toJsonArray(new ArrayList<>(supportedLanguages)))
                .append(";\n");
        // Generiere die `getDetailedLanguageCode`-Funktion
        writer.append(
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
                            return "en_US";
                        }
                        """);
        return writer.toString();
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
