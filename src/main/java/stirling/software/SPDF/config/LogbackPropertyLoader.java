package stirling.software.SPDF.config;

import stirling.software.common.configuration.InstallationPathConfig;

import ch.qos.logback.core.PropertyDefinerBase;

public class LogbackPropertyLoader extends PropertyDefinerBase {
    @Override
    public String getPropertyValue() {
        return InstallationPathConfig.getLogPath();
    }
}
