package stirling.software.SPDF.model.api.page;

import org.springframework.web.multipart.MultipartFile;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;

@Data
@EqualsAndHashCode(callSuper = true)
public class InsertBlankPagesRequest extends PDFWithPageNums {

    private MultipartFile fileInput;
    private int position;
    private int count;
    private String pageSize;
}
