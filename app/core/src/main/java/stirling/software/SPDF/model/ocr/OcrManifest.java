package stirling.software.SPDF.model.ocr;

import java.util.Map;

/**
 * Catalogue of the OCR components an installation can pull in on demand.
 *
 * <p>This is the only thing Stirling-PDF knows about where OCR comes from: not a single download
 * URL is compiled in. Whoever publishes the manifest decides which engine build is handed out, can
 * withdraw or replace a bad artefact without shipping a new release of the application, and can
 * move the hosting anywhere. Pointing {@code system.ocr.manifestUrl} at a local copy is what makes
 * an air-gapped install possible.
 *
 * @param schemaVersion bumped only for changes older clients cannot read
 * @param engine one entry per platform key, e.g. {@code windows-x86_64}
 * @param extras optional pieces that are not languages, currently the {@code osd} orientation model
 * @param languages one entry per Tesseract language code
 */
public record OcrManifest(
        int schemaVersion,
        Map<String, OcrArtifact> engine,
        Map<String, OcrArtifact> extras,
        Map<String, OcrArtifact> languages) {

    public OcrManifest {
        engine = engine == null ? Map.of() : Map.copyOf(engine);
        extras = extras == null ? Map.of() : Map.copyOf(extras);
        languages = languages == null ? Map.of() : Map.copyOf(languages);
    }

    /**
     * A single downloadable file.
     *
     * @param url where to fetch it from
     * @param size expected byte count, shown in the UI so a user can judge the download before
     *     starting it
     * @param sha256 hex digest, verified before anything is moved into place. Never optional: this
     *     is executable code and language data being written next to the application
     * @param version engine version, for display and for deciding whether an upgrade is available
     * @param name human-readable label, e.g. {@code Español}
     */
    public record OcrArtifact(String url, long size, String sha256, String version, String name) {}
}
