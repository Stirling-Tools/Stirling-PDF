import { DOWNLOAD_URLS } from "@app/constants/downloads";

export type DockerImageTag = "latest" | "latest-fat" | "latest-ultra-lite";

const DOCKER_IMAGE = "docker.stirlingpdf.com/stirlingtools/stirling-pdf";

export const dockerRunCommand = (tag: DockerImageTag = "latest") =>
  `docker run -d --name stirling-pdf -p 8080:8080 \\\n  -v ./stirling-data:/configs \\\n  ${DOCKER_IMAGE}:${tag}`;

export const DOCKER_COMPOSE_FILE = `# Save as docker-compose.yml, then run: docker compose up -d
services:
  stirling-pdf:
    image: ${DOCKER_IMAGE}:latest
    ports:
      - "8080:8080"
    volumes:
      - ./stirling-data:/configs
    restart: unless-stopped`;

export const HELM_INSTALL_COMMAND = `helm repo add stirling-pdf https://stirling-tools.github.io/Stirling-PDF-chart
helm repo update
helm install stirling-pdf stirling-pdf/stirling-pdf-chart \\\n  --namespace stirling-pdf --create-namespace`;

export const SERVER_JAR_URL =
  "https://files.stirlingpdf.com/Stirling-PDF-with-login.jar";

export const JAR_RUN_COMMAND =
  "java -Xmx2g -jar Stirling-PDF-with-login.jar\n# then open http://localhost:8080";

export const SELF_HOST_GUIDES = {
  docker: "https://docs.stirlingpdf.com/Installation/Docker%20Install/",
  kubernetes: "https://docs.stirlingpdf.com/Installation/Kubernetes%20Install/",
  manual: DOWNLOAD_URLS.LINUX_DOCS,
} as const;
