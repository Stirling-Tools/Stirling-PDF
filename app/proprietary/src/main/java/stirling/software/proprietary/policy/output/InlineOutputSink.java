package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLConnection;
import java.util.ArrayList;
import java.util.List;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.io.Resource;
import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * Default sink: stores each output in {@code FileStorage} so it is downloadable via {@code GET
 * /api/v1/general/files/{fileId}}. Used for manual runs whose results return to the caller.
 */
@ApplicationScoped
@RequiredArgsConstructor
@IfBuildProfile("saas")
public class InlineOutputSink implements PolicyOutputSink {

    private static final String TYPE = "inline";
    private static final String APPLICATION_OCTET_STREAM = "application/octet-stream";

    private final FileStorage fileStorage;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(OutputSpec spec) {
        return spec == null || spec.type() == null || TYPE.equals(spec.type());
    }

    @Override
    public List<ResultFile> deliver(String runId, List<Resource> outputs, OutputSpec spec)
            throws IOException {
        List<ResultFile> results = new ArrayList<>();
        for (int i = 0; i < outputs.size(); i++) {
            Resource resource = outputs.get(i);
            String name =
                    resource.getFilename() != null ? resource.getFilename() : "result-" + (i + 1);
            String guessed = URLConnection.guessContentTypeFromName(name);
            String contentType = guessed != null ? guessed : APPLICATION_OCTET_STREAM;
            FileStorage.StoredFile stored;
            try (InputStream is = resource.getInputStream()) {
                stored = fileStorage.storeInputStream(is, name);
            }
            results.add(
                    ResultFile.builder()
                            .fileId(stored.fileId())
                            .fileName(name)
                            .contentType(contentType)
                            .fileSize(stored.size())
                            .build());
        }
        return results;
    }
}
