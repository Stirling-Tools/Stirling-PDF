#!/bin/bash

# Default values
build_type="full"
enable_security="false"
run_compose="true"

# Function to parse command line arguments
parse_args() {
    case "$1" in
        ""|-lite|-ultra-lite) build_type="$1";;
    esac

    case "$2" in
        true|false) enable_security="$2";;
    esac

    case "$3" in
        true|false) run_compose="$3";;
    esac
}

# Function to check the health of the service with a timeout of 80 seconds
check_health() {
    local service_name=$1
    local compose_file=$2
    local end=$((SECONDS+80))  # Fixed the timeout to be 80 seconds as per the function comment

    echo -n "Waiting for $service_name to become healthy..."
    until [ "$(docker inspect --format='{{json .State.Health.Status}}' "$service_name")" == '"healthy"' ] || [ $SECONDS -ge $end ]; do
        sleep 3
        echo -n "."
        if [ $SECONDS -ge $end ]; then
            echo -e "\n$service_name health check timed out after 80 seconds."
            echo "Printing logs for $service_name:"
            docker logs "$service_name"
            return 1
        fi
    done
    echo -e "\n$service_name is healthy!"
    echo "Printing logs for $service_name:"
    docker logs "$service_name"
    return 0
}

# Function to build and test a Docker Compose configuration
# Function to build and test a Docker Compose configuration
# Function to build and test a Docker Compose configuration
build_and_test() {
    local version_tag="alpha"
    local dockerfile_name="./Dockerfile"
    local image_base="frooodle/s-pdf"
    local security_suffix=""
    local docker_compose_base="./exampleYmlFiles/docker-compose-latest"
    local compose_suffix=".yml"
    local service_name_base="Stirling-PDF"

    if [ "$enable_security" == "true" ]; then
        security_suffix="-Security"
        docker_compose_base+="-security"  # Append to base name for Docker Compose files with security
    fi

    case "$build_type" in
        full)
            dockerfile_name="./Dockerfile"
            ;;
        ultra-lite)
            dockerfile_name="./Dockerfile-ultra-lite"
            ;;
    esac

    # Dynamic image tag and service name based on build type and security
    local image_tag="${image_base}:latest${build_type}${security_suffix}"
    local service_name="${service_name_base}${build_type^}${security_suffix}"
    local compose_file="${docker_compose_base}${build_type}${compose_suffix}"

    # Gradle build with or without security
    echo "Running ./gradlew clean build with security=$enable_security..."
    ./gradlew clean build

    if [ $? -ne 0 ]; then
        echo "Gradle build failed, exiting script."
        exit 1
    fi

    # Building Docker image
    echo "Building Docker image $image_tag with Dockerfile $dockerfile_name..."
    docker build --build-arg VERSION_TAG=$version_tag -t $image_tag -f $dockerfile_name .

    if [ "$run_compose" == "true" ]; then
        echo "Running Docker Compose for $build_type with security=$enable_security..."
        docker-compose -f "$compose_file" up -d

        # Health check using the dynamic service name
        if ! check_health "$service_name" "$compose_file"; then
            echo "$service_name health check failed."
            docker-compose -f "$compose_file" down
            exit 1
        else
			# If the health check passes, prompt the user to press any key to tear down the service
			read -n 1 -s -r -p "Health check passed. Press any key to tear down the service."
			echo ""  # Move to a new line

			# Tear down the service
			docker-compose -f "$compose_file" down
		fi

        # Tear down the service after the health check passes
        #docker-compose -f "$compose_file" down
    fi
}



# Main function
main() {
    SECONDS=0
    parse_args "$@"
    build_and_test
    echo "All operations completed in $SECONDS seconds."
}

main "$@"
