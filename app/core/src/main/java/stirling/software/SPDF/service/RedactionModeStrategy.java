package stirling.software.SPDF.service;

import java.io.IOException;

import stirling.software.SPDF.model.api.security.RedactPdfRequest;

public interface RedactionModeStrategy {
    byte[] redact(RedactPdfRequest request) throws IOException;
}
