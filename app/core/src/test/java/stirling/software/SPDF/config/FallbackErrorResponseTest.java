package stirling.software.SPDF.config;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.InputStream;
import java.util.Objects;
import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.web.ErrorProperties;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.boot.webmvc.autoconfigure.error.BasicErrorController;
import org.springframework.boot.webmvc.error.DefaultErrorAttributes;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import jakarta.servlet.RequestDispatcher;

class FallbackErrorResponseTest {

    @Test
    void fallbackErrorHidesInternalMessagesEvenWhenRequested() throws Exception {
        Properties properties = new Properties();
        try (InputStream input =
                Objects.requireNonNull(getClass().getResourceAsStream("/application.properties"))) {
            properties.load(input);
        }
        ErrorProperties errorProperties =
                new Binder(new MapConfigurationPropertySource(properties))
                        .bind("spring.web.error", Bindable.of(ErrorProperties.class))
                        .get();
        MockMvc mvc =
                MockMvcBuilders.standaloneSetup(
                                new BasicErrorController(
                                        new DefaultErrorAttributes(), errorProperties))
                        .build();
        String internalMessage = "Could not connect to jdbc:postgresql://private-db/internal";

        mvc.perform(
                        get("/error")
                                .accept(MediaType.APPLICATION_JSON)
                                .param("message", "true")
                                .param("trace", "true")
                                .requestAttr(RequestDispatcher.ERROR_STATUS_CODE, 500)
                                .requestAttr(RequestDispatcher.ERROR_REQUEST_URI, "/api/v1/auth/me")
                                .requestAttr(RequestDispatcher.ERROR_MESSAGE, internalMessage)
                                .requestAttr(
                                        RequestDispatcher.ERROR_EXCEPTION,
                                        new DataAccessResourceFailureException(internalMessage)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist())
                .andExpect(jsonPath("$.exception").doesNotExist())
                .andExpect(content().string(not(containsString(internalMessage))));
    }
}
