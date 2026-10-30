package stirling.software.common.model.api;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

/** Request inputs that may arrive as uploads or as persistent storage references. */
public interface MultiFileInput {

    MultipartFile[] getFileInput();

    void setFileInput(MultipartFile[] fileInput);

    List<String> getFileIds();
}
