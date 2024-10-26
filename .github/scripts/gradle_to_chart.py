import re
import yaml

# Paths to the files
chart_yaml_path = "chart/stirling-pdf/Chart.yaml"
gradle_path = "build.gradle"


def get_chart_version(path):
    """
    Reads the version and the appVersion from Chart.yaml.

    Args:
        path (str): The file path to the Chart.yaml.

    Returns:
        dict: The version under "chart" key and the appVersion under "app" key.
    """
    with open(path, encoding="utf-8") as file:
        chart_yaml = yaml.safe_load(file)
    return {
      "chart": chart_yaml["version"],
      "app": chart_yaml["appVersion"]
    }


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


def get_new_chart_version(chart_version, old_app_version, new_app_version):
  """
  Get the new chart version from

  Args:
      str: The current chart version.
      str: The current app version.
      str: The new app version.

  Returns:
    str: The new chart version to update to.
  """
  chart_major, chart_minor, chart_patch = chart_version.split(".")

  old_major, old_minor, old_patch = old_app_version.split(".")
  new_major, new_minor, new_patch = new_app_version.split(".")

  if old_major != new_major:
    new_chart_version = f"{int(chart_major)+1}.0.0"
  elif old_minor != new_minor:
    new_chart_version = f"{chart_major}.{int(chart_minor)+1}.0"
  elif old_patch != new_patch:
    new_chart_version = f"{chart_major}.{chart_minor}.{int(chart_patch)+1}"

  return new_chart_version


def update_chart_version(path, new_chart_version, new_app_version):
    """
    Updates the version and the appVersion in Chart.yaml with a new version.

    Args:
        path (str): The file path to the Chart.yaml.
        new_chart_version (str): The new chart version to update to.
        new_app_version (str): The new app version to update to.
    """
    with open(path, encoding="utf-8") as file:
        chart_yaml = yaml.safe_load(file)
    chart_yaml["version"] = new_chart_version
    chart_yaml["appVersion"] = new_app_version
    with open(path, "w", encoding="utf-8") as file:
        yaml.safe_dump(chart_yaml, file)


# Main logic
chart_version = get_chart_version(chart_yaml_path)
gradle_version = get_gradle_version(gradle_path)

if chart_version["app"] != gradle_version:
    new_chart_version = get_new_chart_version(chart_version["chart"], chart_version["app"], gradle_version, )
    print(
        f"Versions do not match. Updating Chart.yaml from {chart_version['chart']} to {new_chart_version}."
    )
    update_chart_version(chart_yaml_path, new_chart_version, gradle_version)
else:
    print("Versions match. No update required.")
