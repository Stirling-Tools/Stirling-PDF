package stirling.software.common.service;

/** Provides metadata about tool endpoints for internal dispatch. */
public interface ToolMetadataService {

    /** Returns true if the given operation path accepts multiple input files. */
    boolean isMultiInput(String operationPath);

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
