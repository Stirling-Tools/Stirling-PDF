package stirling.software.SPDF.model.api.page;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import lombok.Data;

@Data
public class ReplacePagesRequest {

    private MultipartFile fileInput;
    private MultipartFile replacementFile;
    private List<Integer> targetIndices;
    private List<Integer> sourceIndices;
}
