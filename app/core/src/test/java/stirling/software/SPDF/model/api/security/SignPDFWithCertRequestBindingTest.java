package stirling.software.SPDF.model.api.security;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartHttpServletRequest;
import org.springframework.web.bind.ServletRequestDataBinder;

/**
 * Verifies the exact concern behind making {@code addTimestamp} default to {@code true}: today's
 * frontend does not know this field exists and will never send it in the multipart form. Spring's
 * data binder must leave the field's default value ({@code true}) untouched when it is absent from
 * the request, the same way {@code @ModelAttribute SignPDFWithCertRequest} binds it in {@link
 * stirling.software.SPDF.controller.api.security.CertSignController#signPDFWithCert}.
 *
 * <p>If this ever regressed to {@code null}/{@code false}, every existing "Sign with Certificate"
 * caller would silently stop getting a timestamp with no code or UI change on their side - exactly
 * the kind of default-value gotcha that assuming "the field initializer will just work" glosses
 * over.
 */
class SignPDFWithCertRequestBindingTest {

    @Test
    @DisplayName(
            "addTimestamp stays true after binding a multipart request that never sends the field"
                    + " (today's unmodified frontend request)")
    void addTimestampDefaultsToTrueWhenFieldIsAbsentFromTheRequest() throws Exception {
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        // Simulate today's frontend request: only the fields it actually knows about.
        request.setParameter("certType", "PFX");
        request.setParameter("password", "password");
        request.setParameter("showSignature", "false");
        request.setParameter("showLogo", "false");
        // Deliberately no "addTimestamp" parameter.

        SignPDFWithCertRequest target = new SignPDFWithCertRequest();
        ServletRequestDataBinder binder = new ServletRequestDataBinder(target);
        binder.bind(request);

        assertTrue(
                Boolean.TRUE.equals(target.getAddTimestamp()),
                "addTimestamp should stay at its default (true) when the request omits it,"
                        + " so existing frontend callers get a timestamp with zero UI changes");
    }
}
