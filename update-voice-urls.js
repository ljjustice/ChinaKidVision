const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: items, error } = await sb.from("items").select("id, name, category, voice_url");
  if (error) { console.error(error); return; }

  let updated = 0;
  for (const item of items) {
    if (item.voice_url) continue;
    const safeName = item.name.replace(/[/\\]/g, "_");
    const encodedName = Buffer.from(safeName).toString("base64url");
    const voiceUrl = `/storage/v1/object/public/voices/items/${encodedName}.mp3`;
    const { error: updateError } = await sb.from("items").update({ voice_url: voiceUrl }).eq("id", item.id);
    if (!updateError) updated++;
  }
  console.log(`更新了 ${updated} 条记录的 voice_url`);
}

main().catch(console.error);
