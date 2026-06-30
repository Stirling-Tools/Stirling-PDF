package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.apache.commons.io.FilenameUtils;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * Writes a run's outputs to the {@code directory} given in the {@link OutputSpec}. Files are
 * streamed (not buffered) and uniquely named to avoid clobbering. Returned {@link ResultFile}s
 * carry a synthetic id since the deliverable is the file on disk, not a {@code FileStorage} entry,
 * so folder outputs are not downloadable via {@code /files/{id}}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class FolderOutputSink implements PolicyOutputSink {

    static final String TYPE = FolderAccessGuard.FOLDER_TYPE;
    static final String DIRECTORY_OPTION = "directory";

    private final FolderAccessGuard accessGuard;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(OutputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    @Override
    public void validate(OutputSpec spec) {
        accessGuard.requirePermitted(directoryOf(spec));
    }

    @Override
    public List<ResultFile> deliver(String runId, List<Resource> outputs, OutputSpec spec)
            throws IOException {
        Path targetDir = accessGuard.requirePermitted(directoryOf(spec));
        Files.createDirectories(targetDir);

        List<ResultFile> results = new ArrayList<>();
        for (int i = 0; i < outputs.size(); i++) {
            Resource resource = outputs.get(i);
            String name = safeName(resource.getFilename(), i);
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

    private static Path directoryOf(OutputSpec spec) {
        Object directory = spec.options().get(DIRECTORY_OPTION);
        if (directory == null || directory.toString().isBlank()) {
            throw new IllegalArgumentException(
                    "folder output requires a '" + DIRECTORY_OPTION + "' option");
        }
        return Path.of(directory.toString());
    }

    // Strip any directory component / "../" so a crafted output name cannot escape targetDir.
    private static String safeName(String filename, int index) {
        if (filename == null || filename.isBlank()) {
            return "output-" + index;
        }
        String name = FilenameUtils.getName(filename);
        if (name.isBlank() || ".".equals(name) || "..".equals(name)) {
            return "output-" + index;
        }
        return name;
    }

    // Non-colliding path, appending " (n)" before the extension.
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
