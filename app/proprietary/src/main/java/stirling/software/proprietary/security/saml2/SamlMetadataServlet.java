package stirling.software.proprietary.security.saml2;

import java.io.IOException;

import jakarta.inject.Inject;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Serves the SP SAML metadata at {@code /saml2/service-provider-metadata/{registrationId}} (the
 * path Spring Security exposed and {@code testing/compose/validate-saml-test.sh} checks). A servlet
 * rather than JAX-RS so quarkus-undertow routes the extension-less path reliably.
 */
@Slf4j
@WebServlet(urlPatterns = "/saml2/service-provider-metadata/*")
public class SamlMetadataServlet extends HttpServlet {

    @Inject Saml2Service samlService;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if (!samlService.isReady()) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND, "SAML2 is not enabled");
            return;
        }
        try {
            String metadata = samlService.buildMetadata();
            response.setContentType("application/samlmetadata+xml");
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write(metadata);
        } catch (Exception e) {
            log.error("Failed to build SAML SP metadata", e);
            response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
        }
    }
}
