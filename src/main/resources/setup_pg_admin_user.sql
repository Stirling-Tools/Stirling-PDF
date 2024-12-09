DO
$do$
BEGIN
   IF EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE rolname = 'admin') THEN

      RAISE NOTICE 'Role "admin" already exists. Skipping.';
   ELSE
      CREATE USER admin WITH ENCRYPTED PASSWORD 'stirling';
   END IF;
END
$do$;

CREATE SCHEMA IF NOT EXISTS stirling_pdf AUTHORIZATION admin;
GRANT ALL PRIVILEGES ON DATABASE postgres TO admin;
GRANT ALL PRIVILEGES ON SCHEMA stirling_pdf TO admin;
ALTER DATABASE postgres SET search_path TO stirling_pdf;
ALTER TABLE authorities OWNER TO admin;
ALTER TABLE persistent_logins OWNER TO admin;
ALTER TABLE sessions OWNER TO admin;
ALTER TABLE user_settings OWNER TO admin;
ALTER TABLE users OWNER TO admin;
ALTER USER admin SET search_path TO stirling_pdf;
SET ROLE admin;