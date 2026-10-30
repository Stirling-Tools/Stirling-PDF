package stirling.software.common.model.api;

import org.springframework.web.multipart.MultipartFile;

/** A single upload that AutoJobAspect can replace with a resolved storage reference. */
public interface SingleFileInput {

    MultipartFile getFileInput();

    void setFileInput(MultipartFile fileInput);

    String getFileId();

    void setFileId(String fileId);
}
