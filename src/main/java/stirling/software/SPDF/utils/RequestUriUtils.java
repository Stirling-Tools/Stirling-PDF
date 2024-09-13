package stirling.software.SPDF.utils;

public class RequestUriUtils {

    public static boolean isStaticResource(String requestURI) {

        return isStaticResource("", requestURI);
    }

    public static boolean isStaticResource(String contextPath, String requestURI) {

        return requestURI.startsWith(contextPath + "/css/")
                || requestURI.startsWith(contextPath + "/fonts/")
                || requestURI.startsWith(contextPath + "/js/")
                || requestURI.endsWith(contextPath + "robots.txt")
                || requestURI.startsWith(contextPath + "/images/")
                || requestURI.startsWith(contextPath + "/public/")
                || requestURI.startsWith(contextPath + "/pdfjs/")
                || requestURI.startsWith(contextPath + "/login")
                || requestURI.endsWith(".svg")
                || requestURI.endsWith(".png")
                || requestURI.endsWith(".ico")
                || requestURI.endsWith(".webmanifest")
                || requestURI.startsWith(contextPath + "/api/v1/info/status");
    }

    public static boolean isTrackableResource(String requestURI) {
        return isTrackableResource("", requestURI);
    }

    public static boolean isTrackableResource(String contextPath, String requestURI) {
        return !(requestURI.startsWith("/js")
                || requestURI.startsWith("/v1/api-docs")
                || requestURI.endsWith("robots.txt")
                || requestURI.startsWith("/images")
                || requestURI.endsWith(".png")
                || requestURI.endsWith(".ico")
                || requestURI.endsWith(".css")
                || requestURI.endsWith(".map")
                || requestURI.endsWith(".svg")
                || requestURI.endsWith(".js")
                || requestURI.contains("swagger")
                || requestURI.startsWith("/api/v1/info")
                || requestURI.startsWith("/site.webmanifest")
                || requestURI.startsWith("/fonts")
                || requestURI.startsWith("/pdfjs"));
    }
}
