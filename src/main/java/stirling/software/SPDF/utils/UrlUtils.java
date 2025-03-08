package stirling.software.SPDF.utils;

import java.io.IOException;
import java.net.ServerSocket;

import jakarta.servlet.http.HttpServletRequest;

public class UrlUtils {

    public static String getOrigin(HttpServletRequest request) {
        String scheme = request.getScheme(); // http or https
        String serverName = request.getServerName(); // localhost
        int serverPort = request.getServerPort(); // 8080
        String contextPath = request.getContextPath(); // /myapp

        return scheme + "://" + serverName + ":" + serverPort + contextPath;
    }

    public static boolean isPortAvailable(int port) {
        try (ServerSocket socket = new ServerSocket(port)) {
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    public static String findAvailablePort(int startPort) {
        int port = startPort;
        while (!isPortAvailable(port)) {
            port++;
        }
        return String.valueOf(port);
    }
}
