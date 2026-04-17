package stirling.software.common.service;

/** Provides metadata about tool endpoints for internal dispatch. */
public interface ToolMetadataService {

    /** Returns true if the given operation path accepts multiple input files. */
    boolean isMultiInput(String operationPath);

    /**
     * Returns true if the given operation produces a ZIP archive response. This is the case for
     * multi-output endpoints (Type:SIMO / Type:MIMO) or endpoints whose declared output type begins
     * with {@code ZIP} (e.g. {@code Output:ZIP-PDF}).
     */
    boolean isZipOutput(String operationPath);
}
