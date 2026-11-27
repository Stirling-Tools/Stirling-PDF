package stirling.software.SPDF.config;

import java.io.IOException;
import java.net.InetAddress;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.service.MobileLanListener;
import stirling.software.common.util.RequestUriUtils;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class MobileLanRequestFilter extends OncePerRequestFilter {

    private static final Set<String> PHONE_PAGES =
            Set.of(
                    "/mobile-scanner",
                    "/mobile-sign",
                    "/favicon.ico",
                    "/favicon.svg",
                    "/apple-touch-icon.png");
    private static final Pattern VALIDATE_SESSION =
            Pattern.compile("/api/v1/mobile-scanner/validate-session/[a-zA-Z0-9-]+");
    private static final Pattern UPLOAD =
            Pattern.compile("/api/v1/mobile-scanner/upload/[a-zA-Z0-9-]+");

    private final MobileLanListener mobileLanListener;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !mobileLanListener.isEnabled() || arrivedOnLoopback(request);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (isPhoneRequest(
                request.getMethod(),
                RequestUriUtils.normalizeUri(request.getContextPath(), request.getRequestURI()))) {
            filterChain.doFilter(request, response);
            return;
        }
        response.sendError(HttpStatus.NOT_FOUND.value());
    }

    static boolean isPhoneRequest(String method, String path) {
        if (path == null) {
            return false;
        }
        if ("GET".equals(method) || "HEAD".equals(method)) {
            return PHONE_PAGES.contains(path) || VALIDATE_SESSION.matcher(path).matches();
        }
        return "POST".equals(method) && UPLOAD.matcher(path).matches();
    }

    private static boolean arrivedOnLoopback(HttpServletRequest request) {
        try {
            return InetAddress.getByName(request.getLocalAddr()).isLoopbackAddress();
        } catch (Exception e) {
            return false;
        }
    }
}
