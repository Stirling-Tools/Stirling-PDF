package stirling.software.saas.payg.charge;

import java.nio.file.Path;

import org.springframework.web.multipart.MultipartFile;

/**
 * One input file to a tool call, materialised. {@code path} is the on-disk copy the lineage
 * detector hashes; {@code multipart} carries the size + content-type metadata the classifier needs.
 * The pair is constructed by the ingress filter (PR-I7a filter) which materialises the request body
 * exactly once. Tests construct it from a fixture file plus a {@code MockMultipartFile} wrapping
 * the same bytes.
 */
public record JobInput(MultipartFile multipart, Path path) {

    public JobInput {
        if (multipart == null) {
            throw new IllegalArgumentException("multipart is required");
        }
        if (path == null) {
            throw new IllegalArgumentException("path is required");
        }
    }
}
