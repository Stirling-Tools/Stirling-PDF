package stirling.software.saas.security;

import java.util.Collections;
import java.util.Enumeration;

import org.springframework.http.HttpHeaders;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

/** The request as later filters should see it once its bearer token has been rejected. */
class WithoutAuthorizationHeader extends HttpServletRequestWrapper {

    WithoutAuthorizationHeader(HttpServletRequest request) {
        super(request);
    }

    @Override
    public String getHeader(String name) {
        return isAuthorization(name) ? null : super.getHeader(name);
    }

    @Override
    public Enumeration<String> getHeaders(String name) {
        return isAuthorization(name) ? Collections.emptyEnumeration() : super.getHeaders(name);
    }

    @Override
    public Enumeration<String> getHeaderNames() {
        return Collections.enumeration(
                Collections.list(super.getHeaderNames()).stream()
                        .filter(name -> !isAuthorization(name))
                        .toList());
    }

    private static boolean isAuthorization(String name) {
        return HttpHeaders.AUTHORIZATION.equalsIgnoreCase(name);
    }
}
