const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let _sb = null;
function getSupabase() {
  if (!_sb) {
    _sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  return _sb;
}

async function ensureBucket(name) {
  const sb = getSupabase();
  const { data, error } = await sb.storage.getBucket(name);
  if (error && error.message.includes("not found")) {
    await sb.storage.createBucket(name, { public: true });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-file-name,x-file-dir",
  };
}

function jsonRes(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json", ...corsHeaders() });
  res.end(JSON.stringify(body));
}

module.exports = { getSupabase, ensureBucket, corsHeaders, jsonRes };
