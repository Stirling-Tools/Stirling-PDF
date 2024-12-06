#!/bin/bash

# Enable robust error handling
set -o errexit
set -o nounset
set -o pipefail

# Variables
DB_NAME="stirling_pdf"
DB_USER="admin"
DB_PASSWORD="stirling"
DB_TYPE=${1:-"postgresql"} # Default to PostgreSQL if not provided
DB_HOST="localhost"
DB_PORT=""

# Check database type and set defaults
case "$DB_TYPE" in
  postgresql)
    DB_PORT="5432"
    ;;
  mysql)
    DB_PORT="3306"
    ;;
  oracle)
    DB_PORT="1521"
    ;;
  *)
    echo "Unsupported database type: $DB_TYPE"
    exit 1
    ;;
esac

# Function to create PostgreSQL database and user
create_postgres() {
  echo "Creating PostgreSQL database '$DB_NAME'..."

  # Check if the database exists
  if psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "Database '$DB_NAME' already exists."
  else
    # Create user and database
    psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "DO \$$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD'; END IF; END \$$;"
    createdb -h "$DB_HOST" -p "$DB_PORT" -U postgres --owner="$DB_USER" "$DB_NAME"
    echo "Database '$DB_NAME' created successfully with owner '$DB_USER'."
  fi
}

# Function to create MySQL database and user
create_mysql() {
  echo "Creating MySQL database '$DB_NAME'..."

  # Check if the database exists
  if mysql -h "$DB_HOST" -P "$DB_PORT" -u root -e "SHOW DATABASES LIKE '$DB_NAME';" | grep -qw "$DB_NAME"; then
    echo "Database '$DB_NAME' already exists."
  else
    # Create user and database
    mysql -h "$DB_HOST" -P "$DB_PORT" -u root -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;"
    mysql -h "$DB_HOST" -P "$DB_PORT" -u root -e "CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';"
    mysql -h "$DB_HOST" -P "$DB_PORT" -u root -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'%';"
    echo "Database '$DB_NAME' created successfully with owner '$DB_USER'."
  fi
}

# Function to create Oracle database and user
create_oracle() {
  echo "Creating Oracle database '$DB_NAME'..."
  # Check if the user exists
  EXISTS=$(sqlplus -s sys/oracle@//"$DB_HOST":"$DB_PORT"/orcl as sysdba <<EOF
SET PAGESIZE 0 FEEDBACK OFF VERIFY OFF HEADING OFF ECHO OFF
SELECT COUNT(*) FROM dba_users WHERE username = UPPER('$DB_USER');
EXIT;
EOF
)
  if [ "$EXISTS" -gt 0 ]; then
    echo "User '$DB_USER' already exists."
  else
    # Create user and schema
    sqlplus -s sys/oracle@//"$DB_HOST":"$DB_PORT"/orcl as sysdba <<EOF
CREATE USER $DB_USER IDENTIFIED BY $DB_PASSWORD;
GRANT CONNECT, RESOURCE TO $DB_USER;
GRANT CREATE SESSION, CREATE TABLE TO $DB_USER;
CREATE TABLESPACE $DB_NAME DATAFILE '$DB_NAME.dbf' SIZE 10M AUTOEXTEND ON NEXT 10M MAXSIZE 100M;
ALTER USER $DB_USER DEFAULT TABLESPACE $DB_NAME;
EXIT;
EOF
    echo "User '$DB_USER' and tablespace '$DB_NAME' created successfully."
  fi
}

# Execute the appropriate function based on the database type
case "$DB_TYPE" in
  postgresql)
    create_postgres
    ;;
  mysql)
    create_mysql
    ;;
  oracle)
    create_oracle
    ;;
esac
