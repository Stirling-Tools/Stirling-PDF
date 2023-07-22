# Build jbig2enc in a separate stage
FROM frooodle/stirling-pdf-base:beta4

# Create scripts folder and copy local scripts
RUN mkdir /scripts
COPY ./scripts/* /scripts/

#Install fonts
RUN mkdir /usr/share/fonts/opentype/noto/
COPY src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto/
COPY src/main/resources/static/fonts/*.otf /usr/share/fonts/opentype/noto/
RUN fc-cache -f -v

# Copy the application JAR file
COPY build/libs/*.jar app.jar

# Expose the application port
EXPOSE 8080

# Set environment variables
ENV APP_HOME_NAME="Stirling PDF"
#ENV APP_HOME_DESCRIPTION="Personal PDF Website!"
#ENV APP_NAVBAR_NAME="Stirling PDF"

# Run the application
RUN chmod +x /scripts/init.sh
ENTRYPOINT ["/scripts/init.sh"]
CMD ["java", "-jar", "/app.jar"]
