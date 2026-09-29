package stirling.software.proprietary.security.repository;

/** Projection: a key id and a usage total, for batching per-key usage into one query. */
public interface ApiKeyUsageSum {
    Long getApiKeyId();

    Long getTotal();
}
