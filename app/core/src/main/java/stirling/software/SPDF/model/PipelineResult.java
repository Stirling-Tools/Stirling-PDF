package stirling.software.SPDF.model;

import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.Resource;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.TempFile;

@Data
@Slf4j
public class PipelineResult implements AutoCloseable {
    private List<Resource> outputFiles;
    private boolean hasErrors;
    private boolean filtersApplied;
    private List<TempFile> tempFiles = new ArrayList<>();

    public void addTempFile(TempFile tempFile) {
        tempFiles.add(tempFile);
    }

    @Override
    public void close() {
        for (TempFile file : tempFiles) {
            file.close();
            log.debug("Deleted temp file: {}", file.getAbsolutePath());
        }
        tempFiles.clear();
    }

    public void cleanup() {
        close();
    }
}
