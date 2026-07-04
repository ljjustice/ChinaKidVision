const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("请设置环境变量");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const { data: items, error } = await sb.from("items").select("id, image_url");
  if (error) { console.error(error); return; }

  let updated = 0;
  for (const item of items) {
    if (!item.image_url) continue;
    const oldPrefix = `${SUPABASE_URL}/storage/v1/object/public/`;
    if (item.image_url.startsWith(oldPrefix)) {
      const newUrl = `/storage/v1/object/public/${item.image_url.slice(oldPrefix.length)}`;
      const { error: updateError } = await sb.from("items").update({ image_url: newUrl }).eq("id", item.id);
      if (updateError) {
        console.error(`  失败: ${item.id} -> ${updateError.message}`);
      } else {
        updated++;
      }
    }
  }
  console.log(`更新了 ${updated} 条记录`);
}

main().catch(console.error);
