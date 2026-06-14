package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import stirling.software.SPDF.service.LanguageService;

/**
 * MIGRATION (Spring -> Quarkus): the controller is a JAX-RS resource whose handler returns the
 * generated JavaScript as a plain {@code String} (the {@code application/javascript} content type
 * is declared via {@code @Produces} and is not observable from a direct method call). The former
 * MockMvc body-substring assertions are preserved as {@code String#contains} checks on the returned
 * value.
 */
class AdditionalLanguageJsControllerTest {

    @Test
    void returnsJsWithSupportedLanguagesAndFunction() {
        LanguageService lang = mock(LanguageService.class);
        // LinkedHashSet for deterministic order in the array
        when(lang.getSupportedLanguages())
                .thenReturn(new LinkedHashSet<>(List.of("de_DE", "en_US")));

        String js = new AdditionalLanguageJsController(lang).generateAdditionalLanguageJs();

        assertTrue(js.contains("const supportedLanguages = [\"de_DE\",\"en_US\"];"));
        assertTrue(js.contains("function getDetailedLanguageCode()"));
        assertTrue(js.contains("return \"en_US\";"));

        verify(lang, times(1)).getSupportedLanguages();
    }

    @Test
    void emptySupportedLanguagesYieldsEmptyArray() {
        LanguageService lang = mock(LanguageService.class);
        when(lang.getSupportedLanguages()).thenReturn(Set.of());

        String js = new AdditionalLanguageJsController(lang).generateAdditionalLanguageJs();

        assertTrue(js.contains("const supportedLanguages = [];"));
    }
}
