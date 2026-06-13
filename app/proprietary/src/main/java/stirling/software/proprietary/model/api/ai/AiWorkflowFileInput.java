package stirling.software.proprietary.model.api.ai;

import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;

@Data
@Schema(description = "A single PDF file input")
public class AiWorkflowFileInput {

    // The controller binds the repeated multipart "fileInput" parts as List<FileUpload> and wraps
    // each into this model (RESTEasy Reactive cannot bind a List of POJOs-with-files directly). The
    // getFileInput() accessor adapts the FileUpload back to the MultipartFile shim the AI workflow
    // service consumes.
    private FileUpload fileInputUpload;

    public AiWorkflowFileInput() {}

    public AiWorkflowFileInput(FileUpload fileInputUpload) {
        this.fileInputUpload = fileInputUpload;
    }

    @Schema(
            description = "The input PDF file",
            contentMediaType = "application/pdf",
            format = "binary")
    public MultipartFile getFileInput() {
        return FileUploadMultipartFile.of(fileInputUpload);
    }
}
