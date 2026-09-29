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
     * Returns true when the endpoint's ZIP response is a transport for several results and should
     * be unpacked, which is exactly the multi-output endpoints (a {@code SIMO} or {@code MIMO}
     * arity).
     *
     * <p>Returns false for an endpoint whose declared output is an archive in its own right (for
     * example {@code extract-attachments}), where unpacking would discard the deliverable.
     */
    boolean shouldUnpackZipResponse(String operationPath);
}
