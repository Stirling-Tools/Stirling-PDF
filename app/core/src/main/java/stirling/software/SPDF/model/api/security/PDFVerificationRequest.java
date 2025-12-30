package stirling.software.SPDF.model.api.security;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PDFVerificationRequest extends PDFFile {}
