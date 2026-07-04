const { getSupabase, ensureBucket, jsonRes } = require("./_lib");
const sharp = require("sharp");

async function compressImage(buf, ext) {
  try {
    if (ext === "png") {
      const out = await sharp(buf, { limitInputPixels: false })
        .resize(800, 600, { fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 8 })
        .toBuffer();
      return out.length < buf.length ? out : buf;
    }
    const out = await sharp(buf, { limitInputPixels: false })
      .resize(800, 600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    return out.length < buf.length ? out : buf;
  } catch {
    return buf;
  }
}

async function handlePost(req, res) {
  const rawName = decodeURIComponent(req.headers["x-file-name"] || "upload.jpg");
  const ext = rawName.split(".").pop().toLowerCase();
  if (!["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return jsonRes(res, 400, { error: "Invalid file type" });
  }

  const relDir = decodeURIComponent(req.headers["x-file-dir"] || "misc");
  let buf;
  if (req.body && typeof req.body === "object" && req.body.data) {
    buf = Buffer.from(req.body.data, "base64");
  } else if (req.body instanceof Buffer) {
    buf = req.body;
  } else if (typeof req.body === "string") {
    buf = Buffer.from(req.body, "binary");
  } else {
    return jsonRes(res, 400, { error: "No file data received" });
  }

  buf = await compressImage(buf, ext);
  const finalExt = ext === "png" ? "png" : "jpg";

  await ensureBucket("images");
  const nameNoExt = rawName.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "");
  const encodedName = Buffer.from(nameNoExt).toString("base64url");
  const encodedDir = relDir.split("/").map(p => Buffer.from(p).toString("base64url")).join("/");
  const storagePath = `${encodedDir}/${encodedName}.${finalExt}`;

  const sb = getSupabase();
  const { error: uploadError } = await sb.storage.from("images").upload(storagePath, buf, {
    contentType: `image/${finalExt === "jpg" ? "jpeg" : finalExt}`,
    upsert: true,
  });
  if (uploadError) {
    return jsonRes(res, 500, { error: "Storage upload failed", detail: uploadError.message });
  }

  const publicUrl = `/storage/v1/object/public/images/${storagePath}`;
  return jsonRes(res, 200, { url: publicUrl });
}

async function handleDelete(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const prefix = "/api/upload";
  let storagePath = urlPath.startsWith(prefix) ? urlPath.slice(prefix.length) : urlPath.slice("/upload".length);
  if (storagePath.startsWith("/")) storagePath = storagePath.slice(1);

  const bucketName = storagePath.startsWith("voices/") ? "voices" : "images";
  const filePath = storagePath.startsWith("voices/") || storagePath.startsWith("images/")
    ? storagePath.split("/").slice(1).join("/")
    : storagePath;

  const sb = getSupabase();
  const { error } = await sb.storage.from(bucketName).remove([filePath]);
  if (error) {
    return jsonRes(res, 500, { error: "Delete failed", detail: error.message });
  }
  return jsonRes(res, 200, { ok: true });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  if (req.method === "POST") {
    try {
      return await handlePost(req, res);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }
  if (req.method === "DELETE") {
    try {
      return await handleDelete(req, res);
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }
  return jsonRes(res, 405, { error: "Method not allowed" });
};
