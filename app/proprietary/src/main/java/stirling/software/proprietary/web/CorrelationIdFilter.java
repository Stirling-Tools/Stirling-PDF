package stirling.software.proprietary.web;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.MDC;

import io.github.pixee.security.Newlines;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

/** Guarantees every request carries a stable X-Request-Id; propagates to MDC. */
// TODO: Migration required - quarkus-undertow provides jakarta.servlet support. Register this
// filter and its URL mapping/ordering via a @WebFilter annotation or a ServletExtension if order
// matters (Spring auto-registered @Component filters; Quarkus does not).
@Slf4j
@ApplicationScoped
public class CorrelationIdFilter implements Filter {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;

        try {
            String id = req.getHeader(HEADER);
            if (id == null || id.isBlank()) {
                id = UUID.randomUUID().toString();
            }
            req.setAttribute(MDC_KEY, id);
            MDC.put(MDC_KEY, id);
            res.setHeader(HEADER, Newlines.stripAll(id));

            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
