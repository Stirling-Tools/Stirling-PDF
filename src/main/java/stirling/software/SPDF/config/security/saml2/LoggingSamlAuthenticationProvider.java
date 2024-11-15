package stirling.software.SPDF.config.security.saml2;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml4AuthenticationProvider;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationException;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationToken;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml4AuthenticationProvider;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationException;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationToken;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.saml2.core.Saml2ErrorCodes;

public class LoggingSamlAuthenticationProvider implements AuthenticationProvider {

    private static final Logger log = LoggerFactory.getLogger(LoggingSamlAuthenticationProvider.class);
    private final OpenSaml4AuthenticationProvider delegate;

    public LoggingSamlAuthenticationProvider(OpenSaml4AuthenticationProvider delegate) {
        this.delegate = delegate;
    }

    @Override
    public Authentication authenticate(Authentication authentication) throws AuthenticationException {
        if (authentication instanceof Saml2AuthenticationToken token) {
            String samlResponse = token.getSaml2Response();

            // Log the raw SAML response
            log.info("Raw SAML Response (Base64): {}", samlResponse);

            // Decode and log the SAML response XML
            try {
            String decodedResponse = new String(Base64.getDecoder().decode(samlResponse), StandardCharsets.UTF_8);
            log.info("Decoded SAML Response XML:\n{}", decodedResponse);
            } catch (IllegalArgumentException e) {
                // If decoding fails, it’s likely already plain XML
                log.warn("SAML Response appears to be different format, not Base64-encoded.");
                log.debug("SAML Response XML:\n{}", samlResponse);
            }
            // Delegate the actual authentication to the wrapped OpenSaml4AuthenticationProvider
            try {
                return delegate.authenticate(authentication);
            } catch (Saml2AuthenticationException e) {
                log.error("SAML authentication failed: {}");
                log.error("Detailed error message: {}", e);
                throw e;
            }
        }

        return null;
    }

    @Override
    public boolean supports(Class<?> authentication) {
        // Only support Saml2AuthenticationToken
        return Saml2AuthenticationToken.class.isAssignableFrom(authentication);
    }
}