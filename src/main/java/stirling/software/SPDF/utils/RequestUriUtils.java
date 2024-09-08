package stirling.software.SPDF.utils;

public class RequestUriUtils {

    public static boolean isStaticResource(String requestURI) {

        return isStaticResource(requestURI, "");
    }

    public static boolean isStaticResource(String contextPath, String requestURI) {

        return requestURI.startsWith(contextPath + "/css/")
                || requestURI.startsWith(contextPath + "/fonts/")
                || requestURI.startsWith(contextPath + "/js/")
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
}
