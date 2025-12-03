package stirling.software.common.model.api.converters;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class HTMLToPdfWebBasedRequest extends PDFFile {}
