import re
import yaml

# Paths to the files
chart_yaml_path = "chart/stirling-pdf/Chart.yaml"
gradle_path = "build.gradle"


def get_chart_version(path):
    """
    Reads the appVersion from Chart.yaml.

    Args:
        path (str): The file path to the Chart.yaml.

    Returns:
        str: The appVersion if found, otherwise an empty string.
    """
    with open(path, encoding="utf-8") as file:
        chart_yaml = yaml.safe_load(file)
    return chart_yaml.get("appVersion", "")


def get_gradle_version(path):
    """
    Extracts the version from build.gradle.

    Args:
        path (str): The file path to the build.gradle.

    Returns:
        str: The version if found, otherwise an empty string.
    """
    with open(path, encoding="utf-8") as file:
        for line in file:
            if "version =" in line:
                # Extracts the value after 'version ='
                return re.search(r'version\s*=\s*[\'"](.+?)[\'"]', line).group(1)
    return ""


def update_chart_version(path, new_version):
    """
    Updates the appVersion in Chart.yaml with a new version.

    Args:
        path (str): The file path to the Chart.yaml.
        new_version (str): The new version to update to.
    """
    with open(path, encoding="utf-8") as file:
        chart_yaml = yaml.safe_load(file)
    chart_yaml["appVersion"] = new_version
    with open(path, "w", encoding="utf-8") as file:
        yaml.safe_dump(chart_yaml, file)


# Main logic
chart_version = get_chart_version(chart_yaml_path)
gradle_version = get_gradle_version(gradle_path)

if chart_version != gradle_version:
    print(
        f"Versions do not match. Updating Chart.yaml from {chart_version} to {gradle_version}."
    )
    update_chart_version(chart_yaml_path, gradle_version)
else:
    print("Versions match. No update required.")
