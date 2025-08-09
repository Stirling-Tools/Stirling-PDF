package stirling.software.SPDF.controller.api;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.SPDF.service.LanguageService;

class AdditionalLanguageJsControllerTest {

    @Test
    void returns_js_with_supported_languages_and_function() throws Exception {
        LanguageService lang = mock(LanguageService.class);
        // LinkedHashSet für deterministische Reihenfolge im Array
        when(lang.getSupportedLanguages())
                .thenReturn(new LinkedHashSet<>(List.of("de_DE", "en_GB")));

        MockMvc mvc =
                MockMvcBuilders.standaloneSetup(new AdditionalLanguageJsController(lang)).build();

        mvc.perform(get("/js/additionalLanguageCode.js"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(new MediaType("application", "javascript")))
                .andExpect(
                        content()
                                .string(
                                        containsString(
                                                "const supportedLanguages ="
                                                        + " [\"de_DE\",\"en_GB\"];")))
                .andExpect(content().string(containsString("function getDetailedLanguageCode()")))
                .andExpect(content().string(containsString("return \"en_GB\";")));

        verify(lang, times(1)).getSupportedLanguages();
    }

    @Test
    void empty_supported_languages_yields_empty_array() throws Exception {
        LanguageService lang = mock(LanguageService.class);
        when(lang.getSupportedLanguages()).thenReturn(Set.of());

        MockMvc mvc =
                MockMvcBuilders.standaloneSetup(new AdditionalLanguageJsController(lang)).build();

        mvc.perform(get("/js/additionalLanguageCode.js"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(new MediaType("application", "javascript")))
                .andExpect(content().string(containsString("const supportedLanguages = [];")));
    }
}
