package stirling.software.common.model.api;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

/** A file list that AutoJobAspect can replace with resolved storage references. */
public interface MultiFileListInput {

    List<MultipartFile> getFiles();

    void setFiles(List<MultipartFile> files);

    List<String> getFileIds();
}
