package stirling.software.saas.legal;

import java.util.List;

/**
 * One legal document's registry entry, as declared in {@code legal/manifest.json}. Immutable
 * snapshot loaded at startup by {@link LegalDocumentRegistry}.
 *
 * <p>{@code parts} lists the pieces, in render order, that make up the document. A plain entry
 * (e.g. {@code "msa.md"}) is a static markdown file under {@code legal/<id>/<version>/}; an entry
 * prefixed with {@code "@"} (e.g. {@code "@order-form"}) is a dynamic section that a document
 * assembler generates at render time.
 */
public record LegalDocumentMeta(
        String id,
        String label,
        String displayName,
        String version,
        String effectiveDate,
        String status,
        List<String> parts) {

    /** Fully-qualified version label shown to users and stored on signatures, e.g. "SEA v0.9.1". */
    public String versionLabel() {
        return label + " v" + version;
    }
}
