package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.apache.commons.io.FilenameUtils;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * Writes a run's output files to a directory on disk. The destination is the {@code directory}
 * option of the {@link OutputSpec}.
 *
 * <p>Files are streamed to disk (so large outputs are not buffered) and given unique names to avoid
 * clobbering existing files. The returned {@link ResultFile}s describe what was written (path +
 * size); they carry a synthetic id because the deliverable is the file on disk, not a {@code
 * FileStorage} entry, so folder outputs are not downloadable via {@code /files/{id}}.
 */
@Slf4j
@Service
public class FolderOutputSink implements PolicyOutputSink {

    static final String TYPE = "folder";
    static final String DIRECTORY_OPTION = "directory";

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(OutputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    @Override
    public List<ResultFile> deliver(String runId, List<Resource> outputs, OutputSpec spec)
            throws IOException {
        Object directory = spec.options().get(DIRECTORY_OPTION);
        if (directory == null || directory.toString().isBlank()) {
            throw new IOException("Folder output requires a '" + DIRECTORY_OPTION + "' option");
        }
        Path targetDir = Path.of(directory.toString());
        Files.createDirectories(targetDir);

        List<ResultFile> results = new ArrayList<>();
        for (int i = 0; i < outputs.size(); i++) {
            Resource resource = outputs.get(i);
            String name = resource.getFilename() != null ? resource.getFilename() : "output-" + i;
            Path target = uniqueTarget(targetDir, name);
            try (InputStream is = resource.getInputStream()) {
                Files.copy(is, target);
            }
            long size = Files.size(target);
            String contentType =
                    MediaTypeFactory.getMediaType(name)
                            .orElse(MediaType.APPLICATION_OCTET_STREAM)
                            .toString();
            results.add(
                    ResultFile.builder()
                            .fileId(UUID.randomUUID().toString())
                            .fileName(target.toString())
                            .contentType(contentType)
                            .fileSize(size)
                            .build());
            log.debug("Wrote policy run {} output to {}", runId, target);
        }
        return results;
    }

    /** Resolve a non-colliding path in {@code dir}, appending " (n)" before the extension. */
    private static Path uniqueTarget(Path dir, String filename) {
        Path candidate = dir.resolve(filename);
        if (!Files.exists(candidate)) {
            return candidate;
        }
        String base = FilenameUtils.getBaseName(filename);
        String ext = FilenameUtils.getExtension(filename);
        String suffix = ext.isEmpty() ? "" : "." + ext;
        for (int n = 1; ; n++) {
            Path next = dir.resolve(base + " (" + n + ")" + suffix);
            if (!Files.exists(next)) {
                return next;
            }
        }
    }
}
