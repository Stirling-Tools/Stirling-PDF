package stirling.software.proprietary.model.api.apikey;

/** Create-key request body from the processor: just a display name for the new personal key. */
public record CreateApiKeyRequest(String name) {}
