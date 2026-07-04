const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("请设置环境变量 SUPABASE_URL 和 SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function safeKey(rel) {
  return rel.split("/").map((part, idx, arr) => {
    if (idx === arr.length - 1) {
      const ext = path.extname(part);
      const name = path.basename(part, ext);
      return Buffer.from(name).toString("base64url") + ext;
    }
    if (/^[a-zA-Z0-9._-]+$/.test(part)) return part;
    return Buffer.from(part).toString("base64url");
  }).join("/");
}

async function compressImage(fullPath) {
  const ext = path.extname(fullPath).toLowerCase();
  const buf = fs.readFileSync(fullPath);
  try {
    let outBuf;
    if (ext === ".png") {
      outBuf = await sharp(buf, { limitInputPixels: false })
        .resize(800, 600, { fit: "inside", withoutEnlargement: true })
        .png({ quality: 80, compressionLevel: 8 })
        .toBuffer();
    } else {
      outBuf = await sharp(buf, { limitInputPixels: false })
        .resize(800, 600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
    }
    return outBuf.length < buf.length ? outBuf : buf;
  } catch {
    return buf;
  }
}

async function uploadDir(bucketName, localDir, concurrency = 3) {
  const { data, error } = await sb.storage.getBucket(bucketName);
  if (error && error.message.includes("not found")) {
    console.log(`创建 Bucket: ${bucketName}`);
    await sb.storage.createBucket(bucketName, { public: true });
  }

  const entries = [];
  function walk(dir, base) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        entries.push({ full, rel });
      }
    }
  }
  walk(localDir, "");
  console.log(`找到 ${entries.length} 个文件在 ${localDir}`);

  let ok = 0, fail = 0, skipped = 0;
  let origTotal = 0, compTotal = 0;

  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(async ({ full, rel }) => {
      const ext = path.extname(full).toLowerCase();
      const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
      const isAudio = ext === ".mp3";

      let buf = fs.readFileSync(full);
      origTotal += buf.length;

      if (isImage) {
        buf = await compressImage(full);
      }

      compTotal += buf.length;

      const contentType = isAudio ? "audio/mpeg"
        : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
        : ext === ".png" ? "image/png"
        : ext === ".gif" ? "image/gif"
        : ext === ".webp" ? "image/webp"
        : "application/octet-stream";

      const storageKey = safeKey(rel);
      const { error: uploadError } = await sb.storage.from(bucketName).upload(storageKey, buf, {
        contentType,
        upsert: true,
      });
      if (uploadError) {
        console.error(`  失败: ${rel} -> ${uploadError.message}`);
        fail++;
      } else {
        ok++;
      }
    }));
    console.log(`  进度: ${Math.min(i + concurrency, entries.length)}/${entries.length}`);
  }
  console.log(`  完成: ${ok} 成功, ${fail} 失败`);
  console.log(`  压缩: ${(origTotal / 1024 / 1024).toFixed(1)}MB -> ${(compTotal / 1024 / 1024).toFixed(1)}MB`);
}

const mode = process.argv[2] || "images";

async function main() {
  if (mode === "voices" || mode === "all") {
    console.log("=== 迁移 voices ===");
    await uploadDir("voices", path.join(__dirname, "voices"), 8);
  }
  if (mode === "images" || mode === "all") {
    console.log("=== 迁移 images（压缩后上传）===");
    await uploadDir("images", path.join(__dirname, "images"), 3);
  }
  console.log("=== 迁移完成 ===");
}

main().catch(console.error);
