import json
import os

http_code = os.environ.get("HTTP_CODE", "")

try:
    with open("/tmp/login_resp.json") as f:
        body = json.load(f)
except Exception as e:
    body = {"unparseable_body": True, "error": str(e)}

body.pop("token", None)  # never commit the real token

with open("login_debug.json", "w") as f:
    json.dump({"http_code": http_code, "body_without_token": body}, f, indent=2)
