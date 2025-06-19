/**
 * Description: Enter description
 * Author: Your Name
 * Date: 2025-06-19
 * Time: 17:06:51
 */


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
