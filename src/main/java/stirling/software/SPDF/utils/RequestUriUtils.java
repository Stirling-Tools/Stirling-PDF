package stirling.software.SPDF.utils;

public class RequestUriUtils {

    public static boolean isStaticResource(String requestURI) {

        return requestURI.startsWith("/css/")
                || requestURI.startsWith("/fonts/")
                || requestURI.startsWith("/js/")
                || requestURI.startsWith("/images/")
                || requestURI.startsWith("/public/")
                || requestURI.startsWith("/pdfjs/")
                || requestURI.startsWith("/pdfjs-legacy/")
                || requestURI.endsWith(".svg")
                || requestURI.endsWith(".webmanifest")
                || requestURI.startsWith("/api/v1/info/status");
    }

    public static boolean isStaticResource(String contextPath, String requestURI) {

        return requestURI.startsWith(contextPath + "/css/")
                || requestURI.startsWith(contextPath + "/fonts/")
                || requestURI.startsWith(contextPath + "/js/")
                || requestURI.startsWith(contextPath + "/images/")
                || requestURI.startsWith(contextPath + "/public/")
                || requestURI.startsWith(contextPath + "/pdfjs/")
                || requestURI.endsWith(".svg")
                || requestURI.endsWith(".webmanifest")
                || requestURI.startsWith(contextPath + "/api/v1/info/status");
    }
}
