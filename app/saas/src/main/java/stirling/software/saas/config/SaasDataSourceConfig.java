package stirling.software.saas.config;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

/**
 * SaaS-profile Postgres datasource configuration.
 */
@Slf4j
@ApplicationScoped
@IfBuildProfile("saas")
public class SaasDataSourceConfig {}
