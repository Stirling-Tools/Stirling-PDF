# Build jbig2enc in a separate stage
FROM frooodle/stirling-pdf-base:beta2

# Create scripts folder and copy local scripts
RUN mkdir /scripts
COPY ./scripts/* /scripts/

# Copy the application JAR file
COPY build/libs/*.jar app.jar

# Expose the application port
EXPOSE 8080

# Set environment variables
ENV APP_HOME_NAME="Stirling PDF"
#ENV APP_HOME_DESCRIPTION="Personal PDF Website!"
#ENV APP_NAVBAR_NAME="Stirling PDF"

# Run the application
ENTRYPOINT ["/scripts/init.sh"]
CMD ["java", "-jar", "/app.jar"]



