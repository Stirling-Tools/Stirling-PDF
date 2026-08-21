package stirling.software.proprietary.model.api.ai;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * Typed engine-emitted progress detail, mirroring the Python {@code ProgressEvent} discriminated
 * union (see {@code engine/src/stirling/contracts/progress.py}). Carried inside {@link
 * AiWorkflowProgressEvent#getEngineDetail()} for {@link AiWorkflowPhase#ENGINE_PROGRESS} events.
 *
 * <p>Sealed so adding a new engine-side phase forces a matching subtype on the Java side instead of
 * silently passing through as an opaque map. The {@code phase} string is the discriminator and
 * stays on the wire so the frontend (which doesn't know about Java's class hierarchy) can switch on
 * it.
 */
@JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        include = JsonTypeInfo.As.EXISTING_PROPERTY,
        property = "phase",
        visible = true)
@JsonSubTypes({
    @JsonSubTypes.Type(
            value = AiEngineProgressDetail.WholeDocReadStarted.class,
            name = "whole_doc_read_started"),
    @JsonSubTypes.Type(
            value = AiEngineProgressDetail.WholeDocSliceDone.class,
            name = "whole_doc_slice_done"),
    @JsonSubTypes.Type(
            value = AiEngineProgressDetail.WholeDocCompressionRound.class,
            name = "whole_doc_compression_round"),
    @JsonSubTypes.Type(
            value = AiEngineProgressDetail.WholeDocReadDone.class,
            name = "whole_doc_read_done"),
})
@JsonIgnoreProperties(ignoreUnknown = true)
public sealed interface AiEngineProgressDetail {

    String phase();

    record WholeDocReadStarted(String phase, String question, int pages, int slices)
            implements AiEngineProgressDetail {}

    record WholeDocSliceDone(
            String phase,
            int completed,
            int total,
            String pages,
            int durationMs,
            int excerpts,
            int facts)
            implements AiEngineProgressDetail {}

    record WholeDocCompressionRound(String phase, int roundNumber, int notesIn, int groups)
            implements AiEngineProgressDetail {}

    record WholeDocReadDone(String phase, int completed, int slices, double durationSeconds)
            implements AiEngineProgressDetail {}
}
