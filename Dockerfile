FROM openjdk:17-jdk-slim
COPY build/libs/*.jar app.jar
EXPOSE 8080
ENV LOG_LEVEL=INFO
ENTRYPOINT ["java","-jar","/app.jar","-Dlogging.level=${LOG_LEVEL}"]