package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * Default sink: stores each output in {@code FileStorage} so it is downloadable via {@code GET
 * /api/v1/general/files/{fileId}}. Used for manual runs whose results return to the caller.
 */
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class InlineOutputSink implements PolicyOutputSink {

    private static final String TYPE = "inline";

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
            String contentType =
                    MediaTypeFactory.getMediaType(name)
                            .orElse(MediaType.APPLICATION_OCTET_STREAM)
                            .toString();
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
