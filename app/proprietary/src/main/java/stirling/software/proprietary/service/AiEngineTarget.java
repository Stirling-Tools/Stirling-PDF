package stirling.software.proprietary.service;

import java.util.Map;

/**
 * Where one AI engine call goes, and what it carries to be trusted there.
 *
 * <p>The two deployments authenticate in completely different ways - a self-hosted engine takes a
 * shared secret both sides already know, Stirling Cloud takes this server's account-link device
 * credential - so the call site asks for a target rather than reading a URL and a secret itself.
 *
 * @param baseUrl root the path is appended to, never with a trailing slash
 * @param headers auth headers to attach, already resolved
 * @param cloud true when this points at Stirling Cloud rather than an engine the customer runs
 */
public record AiEngineTarget(String baseUrl, Map<String, String> headers, boolean cloud) {

    public AiEngineTarget {
        headers = Map.copyOf(headers);
    }

    public String urlFor(String path) {
        return baseUrl + path;
    }
}
