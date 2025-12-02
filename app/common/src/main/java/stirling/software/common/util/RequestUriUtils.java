package stirling.software.common.util;

import lombok.experimental.UtilityClass;

@UtilityClass
public class RequestUriUtils {

    public boolean isStaticResource(String requestURI) {
        return isStaticResource("", requestURI);
    }

    public boolean isStaticResource(String contextPath, String requestURI) {
        return requestURI.startsWith(contextPath + "/css/")
                || requestURI.startsWith(contextPath + "/fonts/")
                || requestURI.startsWith(contextPath + "/js/")
                || requestURI.endsWith(contextPath + "robots.txt")
                || requestURI.startsWith(contextPath + "/images/")
                || requestURI.startsWith(contextPath + "/public/")
                || requestURI.startsWith(contextPath + "/pdfjs/")
                || requestURI.startsWith(contextPath + "/pdfjs-legacy/")
                || requestURI.startsWith(contextPath + "/login")
                || requestURI.startsWith(contextPath + "/error")
                || requestURI.startsWith(contextPath + "/favicon")
                || requestURI.endsWith(".svg")
                || requestURI.endsWith(".png")
                || requestURI.endsWith(".ico")
                || requestURI.endsWith(".txt")
                || requestURI.endsWith(".webmanifest")
                || requestURI.startsWith(contextPath + "/api/v1/info/status");
    }

    public boolean isTrackableResource(String requestURI) {
        return isTrackableResource("", requestURI);
    }

    public boolean isTrackableResource(String contextPath, String requestURI) {
        return !(requestURI.startsWith("/js")
                || requestURI.startsWith("/v1/api-docs")
                || requestURI.endsWith("robots.txt")
                || requestURI.startsWith("/images")
                || requestURI.endsWith(".png")
                || requestURI.endsWith(".ico")
                || requestURI.endsWith(".css")
                || requestURI.endsWith(".txt")
                || requestURI.endsWith(".map")
                || requestURI.endsWith(".svg")
                || requestURI.endsWith("popularity.txt")
                || requestURI.endsWith(".js")
                || requestURI.contains("swagger")
                || requestURI.startsWith("/api/v1/info")
                || requestURI.startsWith("/site.webmanifest")
                || requestURI.startsWith("/fonts")
                || requestURI.startsWith("/pdfjs"));
    }
}
