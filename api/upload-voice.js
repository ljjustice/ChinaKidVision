const { getSupabase, ensureBucket, jsonRes } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  if (req.method !== "POST") {
    return jsonRes(res, 405, { error: "Method not allowed" });
  }

  try {
    const rawName = decodeURIComponent(req.headers["x-file-name"] || "upload.mp3");
    const ext = rawName.split(".").pop().toLowerCase();
    if (ext !== "mp3" && ext !== "mpeg") {
      return jsonRes(res, 400, { error: "Only mp3 files allowed" });
    }

    const relDir = decodeURIComponent(req.headers["x-file-dir"] || "items");
    let buf;
    if (req.body && typeof req.body === "object" && req.body.data) {
      buf = Buffer.from(req.body.data, "base64");
    } else {
      return jsonRes(res, 400, { error: "No file data received" });
    }

    await ensureBucket("voices");
    const nameNoExt = rawName.replace(/\.mp3$/i, "");
    const encodedName = Buffer.from(nameNoExt).toString("base64url");
    const encodedDir = relDir.split("/").map(p => Buffer.from(p).toString("base64url")).join("/");
    const storagePath = `${encodedDir}/${encodedName}.mp3`;

    const sb = getSupabase();
    const { error: uploadError } = await sb.storage.from("voices").upload(storagePath, buf, {
      contentType: "audio/mpeg",
      upsert: true,
    });
    if (uploadError) {
      return jsonRes(res, 500, { error: "Storage upload failed", detail: uploadError.message });
    }

    const publicUrl = `/storage/v1/object/public/voices/${storagePath}`;
    return jsonRes(res, 200, { url: publicUrl });
  } catch (e) {
    return jsonRes(res, 500, { error: e.message });
  }
};
