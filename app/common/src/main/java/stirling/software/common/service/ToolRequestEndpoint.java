package stirling.software.common.service;

import java.util.Optional;
import java.util.function.Supplier;

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
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        return contextPath != null && !contextPath.isEmpty() && uri.startsWith(contextPath)
                ? uri.substring(contextPath.length())
                : uri;
    }
}
