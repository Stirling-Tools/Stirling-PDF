import os

# Server under test. The cucumber Taskfile documents BASE_URL as the way to point
# the suite at another host/port; this is the single place that default lives.
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")
