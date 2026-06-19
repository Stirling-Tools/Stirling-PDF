package stirling.software.saas.payg.charge;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;

import jakarta.servlet.http.Part;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.io.Resource;

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

    // TODO: Migration required - Part/MultipartFile bridge. The ingress interceptor
    // (PaygChargeInterceptor) is now servlet-native and constructs inputs from
    // jakarta.servlet.http.Part rather than Spring's MultipartFile. The downstream classifier still
    // consumes the stirling.software.common.model.MultipartFile abstraction (size + content-type +
    // input stream). This constructor adapts a Part into that abstraction so both the untouched
    // interceptor and the classifier compile/run. Longer term, JobInput should carry a neutral
    // metadata holder and drop the MultipartFile shim entirely.
    public JobInput(Part part, Path path) {
        this(new PartMultipartFile(part), path);
    }

    /** Minimal {@link MultipartFile} view over a servlet {@link Part}. */
    private static final class PartMultipartFile implements MultipartFile {

        private final Part part;

        private PartMultipartFile(Part part) {
            if (part == null) {
                throw new IllegalArgumentException("part is required");
            }
            this.part = part;
        }

        @Override
        public String getName() {
            return part.getName();
        }

        @Override
        public String getOriginalFilename() {
            return part.getSubmittedFileName();
        }

        @Override
        public String getContentType() {
            return part.getContentType();
        }

        @Override
        public boolean isEmpty() {
            return part.getSize() == 0;
        }

        @Override
        public long getSize() {
            return part.getSize();
        }

        @Override
        public byte[] getBytes() throws IOException {
            try (InputStream in = part.getInputStream()) {
                return in.readAllBytes();
            }
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return part.getInputStream();
        }

        @Override
        public Resource getResource() {
            try {
                return new stirling.software.common.model.io.InputStreamResource(
                        getInputStream(), getOriginalFilename());
            } catch (IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        }
    }
}
