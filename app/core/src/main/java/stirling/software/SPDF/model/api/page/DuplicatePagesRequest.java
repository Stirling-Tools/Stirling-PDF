package stirling.software.SPDF.model.api.page;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import lombok.Data;

@Data
public class DuplicatePagesRequest {

    private MultipartFile fileInput;
    private List<Integer> pageIndices;
    private int duplicateCount = 1;
}
