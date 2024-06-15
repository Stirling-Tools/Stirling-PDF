package stirling.software.SPDF.utils;

import jakarta.servlet.http.HttpServletRequest;

public class UrlUtils {

    private UrlUtils() {}

    public static String getOrigin(HttpServletRequest request) {
        String scheme = request.getScheme(); // http or https
        String serverName = request.getServerName(); // localhost
        int serverPort = request.getServerPort(); // 8080
        String contextPath = request.getContextPath(); // /myapp

        return scheme + "://" + serverName + ":" + serverPort + contextPath;
    }
}
