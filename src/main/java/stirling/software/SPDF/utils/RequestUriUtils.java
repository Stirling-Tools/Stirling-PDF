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
                || requestURI.startsWith("/api/v1/info/status");
    }
}
