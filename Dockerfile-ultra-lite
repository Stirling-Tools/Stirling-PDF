# Build jbig2enc in a separate stage
FROM bellsoft/liberica-openjdk-alpine:17

# Set Environment Variables
ENV PUID=1000 \
    PGID=1000 \
    UMASK=022 \
    DOCKER_ENABLE_SECURITY=false \
    HOME=/home/stirlingpdfuser \
    VERSION_TAG=$VERSION_TAG

# Create user and group using Alpine's addgroup and adduser
RUN addgroup -g $PGID stirlingpdfgroup && \
    adduser -u $PUID -G stirlingpdfgroup -s /bin/sh -D stirlingpdfuser && \
    mkdir -p $HOME && chown stirlingpdfuser:stirlingpdfgroup $HOME

# Set up necessary directories and permissions
RUN mkdir -p /scripts /configs /customFiles && \
    chown -R stirlingpdfuser:stirlingpdfgroup /scripts /configs /customFiles

COPY build/libs/*.jar app.jar

# Set font cache and permissions
RUN chown stirlingpdfuser:stirlingpdfgroup /app.jar

# Expose the application port
EXPOSE 8080

# Set environment variables
ENV ENDPOINTS_GROUPS_TO_REMOVE=CLI
ENV DOCKER_ENABLE_SECURITY=false

# Run the application
CMD ["java", "-jar", "/app.jar"]
