package stirling.software.common.service;

/** Provides metadata about tool endpoints for internal dispatch. */
public interface ToolMetadataService {

    /** Returns true if the given operation path accepts multiple input files. */
    boolean isMultiInput(String operationPath);
}
