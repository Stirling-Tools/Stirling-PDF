from __future__ import annotations

from models import tool_models


def dump_params(params: tool_models.ParamToolModel | None) -> dict[str, object]:
    if params is None:
        return {}
    return params.model_dump(by_alias=True, exclude_none=True)


def normalize_param_keys(
    param_model: tool_models.ParamToolModelType | None,
    data: dict[str, object],
) -> dict[str, object]:
    if param_model is None or not data:
        return data
    field_map: dict[str, str] = {}
    for name, field in param_model.model_fields.items():
        alias = field.alias or name
        field_map[name.lower()] = alias
        field_map[alias.lower()] = alias

    normalized: dict[str, object] = {}
    for key, value in data.items():
        mapped = field_map.get(key.lower())
        normalized[mapped or key] = value
    return normalized


def merge_param_updates(
    param_model: tool_models.ParamToolModelType | None,
    base: tool_models.ParamToolModel | None,
    updates: dict[str, object],
) -> tool_models.ParamToolModel | None:
    if param_model is None:
        return None
    data = dump_params(base)
    data.update(updates)
    if not data:
        return None
    normalized = normalize_param_keys(param_model, data)
    return param_model.model_validate(normalized)
