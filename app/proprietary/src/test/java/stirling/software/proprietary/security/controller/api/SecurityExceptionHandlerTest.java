package stirling.software.proprietary.security.controller.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

class SecurityExceptionHandlerTest {
    @Test
    void methodAuthorizationDenialTakesPrecedenceOverGenericRuntimeErrors() throws Exception {
        MockMvcBuilders.standaloneSetup(new RestrictedController())
                .setControllerAdvice(new RuntimeErrors(), new SecurityExceptionHandler())
                .build()
                .perform(get("/restricted"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Access denied"));
    }

    @RestController
    static class RestrictedController {
        @GetMapping("/restricted")
        void restricted() {
            throw new AuthorizationDeniedException("Private connection details");
        }
    }

    @RestControllerAdvice
    static class RuntimeErrors {
        @ExceptionHandler(RuntimeException.class)
        ProblemDetail unexpected(RuntimeException exception) {
            return ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
