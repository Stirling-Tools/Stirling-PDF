package stirling.software.SPDF.model;

import java.util.List;

/**
 * Domain events published when pipeline processing completes or fails. Consumed by {@link
 * stirling.software.SPDF.controller.api.pipeline.PipelineSSEEventListener} which routes them to the
 * appropriate SSE session.
 */
public sealed interface PipelineEvent {

    record JobCompleted(String sessionId, String jobId, String filename) implements PipelineEvent {}

    record JobFailed(String sessionId, String jobId, String error) implements PipelineEvent {}

    /**
     * Fired by {@link
     * stirling.software.SPDF.controller.api.pipeline.PipelineDirectoryProcessor} when a server
     * watch folder batch succeeds. {@code outputFiles} are filenames of the form {@code
     * {fileId}.{ext}} — the frontend strips the extension to recover the IDB fileId.
     */
    record FolderCompleted(String sessionId, String folderId, List<String> outputFiles)
            implements PipelineEvent {}

    /**
     * Fired when a server watch folder batch fails (pipeline reported errors). {@code failedFileIds}
     * are the IDB fileIds extracted from the input filenames ({@code {fileId}.{ext}}).
     */
    record FolderError(String sessionId, String folderId, List<String> failedFileIds)
            implements PipelineEvent {}
}
