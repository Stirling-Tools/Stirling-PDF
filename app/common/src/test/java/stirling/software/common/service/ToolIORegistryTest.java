package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIOSpec;

/**
 * Covers the {@link ToolMetadataService} behaviour the pipeline executors depend on, now that it is
 * answered from {@code @ToolIO} declarations rather than parsed out of description prose.
 */
class ToolIORegistryTest {

    private static final String SPLIT = "/api/v1/general/split-pages";
    private static final String MERGE = "/api/v1/general/merge-pdfs";
    private static final String ROTATE = "/api/v1/general/rotate-pdf";
    private static final String ATTACHMENTS = "/api/v1/security/get-attachments";
    private static final String EXTRACT_IMAGES = "/api/v1/misc/extract-images";
    private static final String CONVERT_ANY = "/api/v1/convert/file/pdf";
    private static final String UNKNOWN = "/api/v1/general/does-not-exist";

    private static ToolIOSpec spec(ToolFormat accepts, ToolFormat produces, ToolArity arity) {
        return new ToolIOSpec(Set.of(accepts), produces, arity, List.of());
    }

    private final ToolIORegistry registry =
            ToolIORegistry.forSpecs(
                    Map.of(
                            SPLIT, spec(ToolFormat.PDF, ToolFormat.PDF, ToolArity.SIMO),
                            MERGE, spec(ToolFormat.PDF, ToolFormat.PDF, ToolArity.MISO),
                            ROTATE, spec(ToolFormat.PDF, ToolFormat.PDF, ToolArity.SISO),
                            ATTACHMENTS, spec(ToolFormat.PDF, ToolFormat.ZIP, ToolArity.SISO),
                            EXTRACT_IMAGES, spec(ToolFormat.PDF, ToolFormat.IMAGE, ToolArity.SIMO),
                            CONVERT_ANY, spec(ToolFormat.ANY, ToolFormat.PDF, ToolArity.SISO)));

    @Test
    void multiInputFollowsArity() {
        assertTrue(registry.isMultiInput(MERGE));
        assertFalse(registry.isMultiInput(SPLIT));
        assertFalse(registry.isMultiInput(ROTATE));
        assertFalse(registry.isMultiInput(UNKNOWN));
    }

    @Test
    void inputExtensionsComeFromAcceptedFormats() {
        assertEquals(List.of("pdf"), registry.getExtensionTypes(false, ROTATE));
    }

    @Test
    void outputExtensionsComeFromTheProducedFormat() {
        assertEquals(List.of("pdf"), registry.getExtensionTypes(true, ROTATE));
        assertTrue(registry.getExtensionTypes(true, EXTRACT_IMAGES).contains("png"));
    }

    @Test
    void noRestrictionIsReportedAsNull() {
        // Callers treat null as "any type accepted", so ANY and an unknown endpoint agree.
        assertNull(registry.getExtensionTypes(false, CONVERT_ANY));
        assertNull(registry.getExtensionTypes(false, UNKNOWN));
    }

    @Test
    void multiOutputResponsesAreUnpacked() {
        assertTrue(registry.shouldUnpackZipResponse(SPLIT));
        assertTrue(registry.shouldUnpackZipResponse(EXTRACT_IMAGES));
    }

    @Test
    void anArchiveDeliverableStaysPacked() {
        // get-attachments returns the archive itself, so unpacking it would lose the deliverable.
        assertFalse(registry.shouldUnpackZipResponse(ATTACHMENTS));
    }

    @Test
    void singleOutputResponsesAreNotUnpacked() {
        assertFalse(registry.shouldUnpackZipResponse(ROTATE));
        assertFalse(registry.shouldUnpackZipResponse(MERGE));
        assertFalse(registry.shouldUnpackZipResponse(UNKNOWN));
    }
}
