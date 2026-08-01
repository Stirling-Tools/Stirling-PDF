package stirling.software.common.service;

import java.util.List;

/** Provides metadata about tool endpoints for internal dispatch. */
public interface ToolMetadataService {

    /** Returns true if the given operation path accepts multiple input files. */
    boolean isMultiInput(String operationPath);

    /**
     * Returns the file extensions (lowercase, no leading dot, e.g. {@code "pdf"}) that the
     * operation accepts as input ({@code output=false}) or produces as output ({@code
     * output=true}), derived from the endpoint's declared type. Returns {@code null} when the
     * endpoint declares no specific type, which callers should treat as "any type accepted".
     */
    List<String> getExtensionTypes(boolean output, String operationPath);

    /**
     * Returns true when the endpoint's ZIP response is a transport for multiple typed results and
     * should be unpacked: multi-output endpoints (Type:SIMO / Type:MIMO) and wrapper declarations
     * such as {@code Output:ZIP-PDF} or {@code Output:IMAGE/ZIP}.
     *
     * <p>Returns false for a bare {@code Output:ZIP} (e.g. {@code get-attachments}), where the
     * archive itself is the deliverable and should be kept packed.
     */
    boolean shouldUnpackZipResponse(String operationPath);
}
