from typing import Any, Dict, Optional


CONFIRM_VALUE = "confirm"


def is_confirmed(value: Optional[str]) -> bool:
    return value == CONFIRM_VALUE


def build_confirmation_required(
    action: str,
    target: str,
    message: str,
    confirmation_token: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    confirmation = {
        "action": action,
        "target": target,
        "message": message,
        "confirm_value": CONFIRM_VALUE,
    }
    if confirmation_token:
        confirmation["confirmation_token"] = confirmation_token
        confirmation["user_prompt"] = f"确认执行 {confirmation_token}"
    if details:
        confirmation["details"] = details

    return {
        "requires_confirmation": True,
        "confirmation": confirmation,
    }
