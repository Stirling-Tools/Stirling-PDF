package stirling.software.SPDF.model.api.misc;

import org.springframework.http.MediaType;

import stirling.software.common.util.TempFile;

public record FileResponseData(TempFile tempFile, String fileName, MediaType mediaType) {}
