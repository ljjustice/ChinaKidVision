const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/items?select=id&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    }
  });
  const data = await res.json();
  console.log("items table accessible, columns:", data);
  
  const alterRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "ALTER TABLE items ADD COLUMN IF NOT EXISTS voice_url TEXT DEFAULT ''" })
  });
  const alterData = await alterRes.json();
  console.log("alter result:", alterData);
}

main().catch(console.error);
