package stirling.software.proprietary.service;

import java.util.Map;

/** Where one AI engine call goes and the auth headers it carries; baseUrl has no trailing slash. */
public record AiEngineTarget(String baseUrl, Map<String, String> headers, boolean cloud) {

    public AiEngineTarget {
        headers = Map.copyOf(headers);
    }

    public String urlFor(String path) {
        return baseUrl + path;
    }
}
