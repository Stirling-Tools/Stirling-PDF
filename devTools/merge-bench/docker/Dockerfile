FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends libqpdf29t64 fontconfig libbrotli1 libbz2-1.0 libfreetype6 libglib2.0-0t64 libgraphite2-3 libharfbuzz-subset0 libharfbuzz0b libicu74 libjpeg-turbo8 libpcre2-32-0 libpcre2-8-0 libpng16-16t64 libpugixml1v5 libunibreak5 && rm -rf /var/lib/apt/lists/*
COPY --from=eclipse-temurin:25-jdk /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk PATH=/opt/java/openjdk/bin:$PATH
