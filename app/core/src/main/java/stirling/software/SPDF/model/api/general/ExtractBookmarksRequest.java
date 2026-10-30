package stirling.software.SPDF.model.api.general;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ExtractBookmarksRequest extends PDFFile {}
