package stirling.software.SPDF.model.api.misc;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ExtractAttachmentsRequest extends PDFFile {}
