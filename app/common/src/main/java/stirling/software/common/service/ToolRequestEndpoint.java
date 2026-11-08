package stirling.software.common.service;

import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.http.server.PathContainer;
import org.springframework.web.servlet.HandlerMapping;

import jakarta.servlet.http.HttpServletRequest;

public final class ToolRequestEndpoint {

    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private ToolRequestEndpoint() {}

    public static <T> T callWith(String endpoint, Supplier<T> work) {
        String previous = CURRENT.get();
        CURRENT.set(endpoint);
        try {
            return work.get();
        } finally {
            if (previous == null) {
                CURRENT.remove();
            } else {
                CURRENT.set(previous);
            }
        }
    }

    public static Optional<String> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static String pathOf(HttpServletRequest request) {
        if (request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE)
                instanceof String pattern) {
            return pattern;
        }
        String uri = request.getRequestURI();
        if (uri == null) {
            return null;
        }
        String contextPath = request.getContextPath();
        String path =
                contextPath != null && !contextPath.isEmpty() && uri.startsWith(contextPath)
                        ? uri.substring(contextPath.length())
                        : uri;
        return decoded(path);
    }

    private static String decoded(String path) {
        StringBuilder out = new StringBuilder(path.length());
        for (PathContainer.Element element : PathContainer.parsePath(path).elements()) {
            out.append(
                    element instanceof PathContainer.PathSegment segment
                            ? segment.valueToMatch()
                            : element.value());
        }
        return out.toString();
    }
}
