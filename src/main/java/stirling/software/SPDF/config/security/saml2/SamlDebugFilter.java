package stirling.software.SPDF.config.security.saml2;

import java.io.IOException;
import java.util.Collections;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class SamlDebugFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) 
            throws ServletException, IOException {
        if (request.getRequestURI().contains("/saml2/")) {
            log.debug("SAML Debug - URI: {}", request.getRequestURI());
            log.debug("SAML Debug - Query String: {}", request.getQueryString());
            log.debug("SAML Debug - Method: {}", request.getMethod());
            Collections.list(request.getHeaderNames()).forEach(headerName ->
                log.debug("SAML Debug - Header {}: {}", headerName, request.getHeader(headerName)));
        }
        filterChain.doFilter(request, response);
    }
}