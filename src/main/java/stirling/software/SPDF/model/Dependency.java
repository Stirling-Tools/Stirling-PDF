package stirling.software.SPDF.model;

import lombok.Data;

@Data
public class Dependency {
    private String moduleName;
    private String moduleUrl;
    private String moduleVersion;
    private String moduleLicense;
    private String moduleLicenseUrl;
}
