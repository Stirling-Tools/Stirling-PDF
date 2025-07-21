package stirling.software.proprietary.web;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import io.github.pixee.security.Newlines;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

/** Guarantees every request carries a stable X-Request-Id; propagates to MDC. */
@Slf4j
@Component
public class CorrelationIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";

    @Override
    protected void doFilterInternal(
            HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        try {
            String id = req.getHeader(HEADER);
            if (!StringUtils.hasText(id)) {
                id = UUID.randomUUID().toString();
            }
            req.setAttribute(MDC_KEY, id);
            MDC.put(MDC_KEY, id);
            res.setHeader(HEADER, Newlines.stripAll(id));

            chain.doFilter(req, res);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
