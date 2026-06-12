package stirling.software.saas.config;

import jakarta.enterprise.context.ApplicationScoped;

import io.quarkus.arc.profile.IfBuildProfile;

import lombok.extern.slf4j.Slf4j;

/**
 * SaaS-profile Postgres datasource configuration.
 *
 * <p>TODO: Migration required - datasource/JPA now configured via quarkus.datasource.* /
 * quarkus.hibernate-orm.* in application.properties. The former Hikari-based DataSource bean
 * (Postgres, @Primary over the OSS H2 default) translates to Quarkus config, e.g.:
 *
 * <pre>
 * quarkus.datasource.db-kind=postgresql
 * quarkus.datasource.username=${SPRING_DATASOURCE_USERNAME:postgres}
 * quarkus.datasource.password=${SPRING_DATASOURCE_PASSWORD:}
 * quarkus.datasource.jdbc.url=${SPRING_DATASOURCE_URL}
 * quarkus.datasource.jdbc.max-size=20
 * quarkus.datasource.jdbc.min-size=5
 * quarkus.datasource.jdbc.idle-removal-interval / max-lifetime / background-validation-interval
 * quarkus.datasource.jdbc.new-connection-sql=SET search_path TO stirling_pdf, auth, public
 * quarkus.datasource.jdbc.additional-jdbc-properties.ApplicationName=StirlingPDF-SaaS
 * </pre>
 *
 * Connection pooling (Agroal) and the Postgres driver are provided by Quarkus, so the Hikari
 * configuration, DatabaseDriver lookup, and ApplicationName URL-rewriting helper are obsolete.
 */
@Slf4j
@ApplicationScoped
@IfBuildProfile("saas")
public class SaasDataSourceConfig {}
