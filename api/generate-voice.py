import json
import edge_tts
import tempfile
import os

async def synthesize(text, voice, rate):
    rate_str = f"-{rate.replace('%', '')}%" if rate else "-25%"
    communicate = edge_tts.Communicate(text, voice, rate=rate_str)
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp_path = tmp.name
    tmp.close()
    await communicate.save(tmp_path)
    with open(tmp_path, "rb") as f:
        data = f.read()
    os.unlink(tmp_path)
    return data


def handler(req):
    if req["method"] == "OPTIONS":
        return {"statusCode": 200, "headers": {"Content-Type": "text/plain"}, "body": "ok"}

    if req["method"] != "POST":
        return {"statusCode": 405, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "Method not allowed"})}

    try:
        body = json.loads(req.get("body", "{}"))
        text = body.get("text", "")
        filename = body.get("filename", "output.mp3")
        dir_name = body.get("dir", "items")

        if not text or not filename:
            return {"statusCode": 400, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "text and filename required"})}

        import asyncio
        audio_data = asyncio.get_event_loop().run_until_complete(
            synthesize(text, "zh-CN-YunxiaNeural", "-25%")
        )

        if not audio_data:
            return {"statusCode": 500, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "TTS produced no audio"})}

        import base64
        from supabase import create_client

        supabase_url = os.environ.get("SUPABASE_URL", "")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
        sb = create_client(supabase_url, supabase_key)

        safe_name = filename.replace("/", "_").replace("\\", "_").replace(".mp3", "")
        encoded_name = base64.urlsafe_b64encode(safe_name.encode("utf-8")).decode("ascii").rstrip("=")
        storage_path = f"{dir_name}/{encoded_name}.mp3"

        sb.storage.from_("voices").upload(storage_path, audio_data, {"content_type": "audio/mpeg", "upsert": True})

        public_url = f"/storage/v1/object/public/voices/{storage_path}"

        return {"statusCode": 200, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"url": public_url})}

    except Exception as e:
        return {"statusCode": 500, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": str(e)})}
