package stirling.software.proprietary.mcp.files;

import java.io.IOException;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import tools.jackson.databind.ObjectMapper;

/**
 * Turns away posts to an upload link that is not open before anything reads the body. The upload
 * path is public, and multipart parsing would otherwise spool up to the servlet's 2 GB limit to
 * disk for any made-up token. Runs ahead of every other filter because a {@code getParameter} call
 * on a multipart request is enough to trigger that parse.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpUploadGateFilter extends OncePerRequestFilter {

    private final McpUploadLinks links;
    private final ObjectMapper mapper;

    public McpUploadGateFilter(McpUploadLinks links, ObjectMapper mapper) {
        this.links = links;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equalsIgnoreCase(request.getMethod())
                || !path(request).startsWith(McpUploadLinks.PATH);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String token = path(request).substring(McpUploadLinks.PATH.length());
        if (links.isOpen(token)) {
            chain.doFilter(request, response);
            return;
        }
        String accept = request.getHeader("Accept");
        response.setStatus(HttpServletResponse.SC_NOT_FOUND);
        response.setHeader("Connection", "close");
        if (accept != null && accept.contains(MediaType.TEXT_HTML_VALUE)) {
            response.setContentType(MediaType.TEXT_HTML_VALUE + ";charset=UTF-8");
            response.getWriter().write(McpUploadController.expiredPage());
        } else {
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter()
                    .write(
                            mapper.writeValueAsString(
                                    Map.of("error", McpUploadController.EXPIRED_MESSAGE)));
        }
    }

    private static String path(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        return context != null && !context.isEmpty() && uri.startsWith(context)
                ? uri.substring(context.length())
                : uri;
    }
}
