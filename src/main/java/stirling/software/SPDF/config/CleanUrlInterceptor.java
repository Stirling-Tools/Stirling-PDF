package stirling.software.SPDF.config;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.ModelAndView;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class CleanUrlInterceptor implements HandlerInterceptor {

    private static final Pattern LANG_PATTERN = Pattern.compile("&?lang=([^&]+)");

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String queryString = request.getQueryString();
        if (queryString != null && !queryString.isEmpty()) {
            String requestURI = request.getRequestURI();

            // Keep the lang parameter if it exists
            Matcher langMatcher = LANG_PATTERN.matcher(queryString);
            String langQueryString = langMatcher.find() ? "lang=" + langMatcher.group(1) : "";

            // Check if there are any other query parameters besides the lang parameter
            String remainingQueryString = queryString.replaceAll(LANG_PATTERN.pattern(), "").replaceAll("&+", "&").replaceAll("^&|&$", "");

            if (!remainingQueryString.isEmpty()) {
                // Redirect to the URL without other query parameters
                String redirectUrl = requestURI + (langQueryString.isEmpty() ? "" : "?" + langQueryString);
                response.sendRedirect(redirectUrl);
                return false;
            }
        }
        return true;
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler, ModelAndView modelAndView) {
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
    }
}
