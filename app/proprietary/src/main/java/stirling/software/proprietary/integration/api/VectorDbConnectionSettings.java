package stirling.software.proprietary.integration.api;

import java.util.LinkedHashMap;
import java.util.Map;

/** Credentials belong to a connection; collection and field mapping belong to its source. */
public record VectorDbConnectionSettings(String vendor, ApiConnectionSettings api) {
    public static VectorDbConnectionSettings from(Map<String, Object> config) {
        String vendor = String.valueOf(config.getOrDefault("vendor", "")).trim();
        if (!vendor.equals("weaviate") && !vendor.equals("pinecone")) {
            throw new IllegalArgumentException(
                    "Select a supported vector database: Weaviate or Pinecone");
        }
        Map<String, Object> api = new LinkedHashMap<>();
        api.put("baseUrl", config.get("baseUrl"));
        api.put("token", config.get("token"));
        api.put("authType", vendor.equals("pinecone") ? "HEADER" : "BEARER");
        if (vendor.equals("pinecone")) {
            api.put("headerName", "Api-Key");
            api.put("headers", Map.of("X-Pinecone-Api-Version", "2025-10"));
        }
        return new VectorDbConnectionSettings(vendor, ApiConnectionSettings.from(api));
    }
}
