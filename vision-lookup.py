"""Vision helper: analyze an image with qwen/qwen3.6-27b on Groq (free, vision-capable)."""
import base64, json, os, sys, time, urllib.request

MAX_RETRIES = 6

class RateLimitError(Exception):
    pass

class ApiError(Exception):
    pass

API_KEY = os.environ.get("GROQ_API_KEY")
if not API_KEY:
    raise SystemExit("Set GROQ_API_KEY in the environment (see .env) before running vision-lookup.py")
MODEL = "qwen/qwen3.6-27b"

def analyze(path, prompt, max_tokens=800):
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    body = {
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64," + b64}}
            ]
        }],
        "max_tokens": max_tokens
    }
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + API_KEY, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                resp = json.loads(r.read())
            return resp["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = (2 ** attempt) * 5
                print(f"[rate-limited] retrying in {wait}s (attempt {attempt+1}/{MAX_RETRIES})...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise ApiError(f"HTTP {e.code}: {e.read().decode()[:300]}")
    raise RateLimitError("exhausted retries")

if __name__ == "__main__":
    path = sys.argv[1]
    prompt = sys.argv[2] if len(sys.argv) > 2 else "Describe what is visible in this image in detail. List all website names, URLs, app names, or platform names shown."
    print(analyze(path, prompt))
