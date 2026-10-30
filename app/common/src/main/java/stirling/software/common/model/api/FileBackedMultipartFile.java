package stirling.software.common.model.api;

import java.io.IOException;
import java.nio.file.Path;

/** A MultipartFile backed by a regular file, so tools can read it without copying first. */
public interface FileBackedMultipartFile {

    /** Returns null when storage cannot expose a local path. */
    Path getPath() throws IOException;
}
