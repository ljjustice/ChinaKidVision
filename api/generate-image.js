const { getSupabase, ensureBucket, jsonRes } = require("./_lib");

const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_API_URL = "https://apihub.agnes-ai.com/v1/images/generations";

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  if (req.method !== "POST") {
    return jsonRes(res, 405, { error: "Method not allowed" });
  }

  try {
    const { prompt, category, filename } = req.body;
    if (!prompt || !category || !filename) {
      return jsonRes(res, 400, { error: "prompt, category and filename required" });
    }

    const body = JSON.stringify({ model: "agnes-image-2.1-flash", prompt, size: "1024x768" });
    const apiRes = await fetch(AGNES_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${AGNES_API_KEY}`, "Content-Type": "application/json" },
      body,
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return jsonRes(res, 502, { error: "Agnes API failed", detail: errText });
    }

    const apiData = await apiRes.json();
    const imgUrl = apiData.data?.[0]?.url;
    if (!imgUrl) {
      return jsonRes(res, 502, { error: "No image URL in response" });
    }

    const imgRes = await fetch(imgUrl);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());

    await ensureBucket("images");
    const rawName = filename.replace(/[/\\]/g, "_");
    const nameNoExt = rawName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, "");
    const encodedName = Buffer.from(nameNoExt).toString("base64url");
    const storagePath = `${category}/${encodedName}.jpg`;

    const sb = getSupabase();
    const { error: uploadError } = await sb.storage.from("images").upload(storagePath, imgBuf, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (uploadError) {
      return jsonRes(res, 500, { error: "Storage upload failed", detail: uploadError.message });
    }

    const { data: urlData } = sb.storage.from("images").getPublicUrl(storagePath);
    const publicUrl = `/storage/v1/object/public/images/${storagePath}`;
    return jsonRes(res, 200, { url: publicUrl });
  } catch (e) {
    return jsonRes(res, 500, { error: e.message });
  }
};
