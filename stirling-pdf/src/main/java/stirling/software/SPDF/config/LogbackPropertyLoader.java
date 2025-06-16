package stirling.software.SPDF.config;

import ch.qos.logback.core.PropertyDefinerBase;
import stirling.software.common.configuration.InstallationPathConfig;

public class LogbackPropertyLoader extends PropertyDefinerBase {
    @Override
    public String getPropertyValue() {
        return InstallationPathConfig.getLogPath();
    }
}
