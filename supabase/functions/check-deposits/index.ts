// =====================================================================
//  check-deposits — Verificación automática de depósitos USDT (TRC20)
//
//  1. Lee los depósitos en estado "esperando".
//  2. Consulta en TronGrid las transferencias USDT confirmadas que
//     llegaron a la dirección configurada (app_config.usdt_address).
//  3. Si una transferencia coincide con el monto exacto de un depósito
//     y llegó dentro de su ventana de tiempo, acredita el saldo.
//
//  Se puede llamar desde el panel ("Ya pagué, verificar") o desde un
//  cron cada minuto. Variables: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
//  (Supabase las inyecta solas); TRONGRID_API_KEY es opcional.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // USDT oficial en Tron
const GRACE_MS = 2 * 60 * 60 * 1000; // acepta pagos hasta 2 h después de expirar
const EXPIRE_AFTER_MS = 24 * 60 * 60 * 1000; // marca "expirado" tras 24 h

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Trc20Tx = {
  transaction_id: string;
  from: string;
  to: string;
  value: string;
  block_timestamp: number;
  token_info?: { address?: string; decimals?: number };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Dirección de la wallet
  const { data: cfg, error: cfgErr } = await db.from("app_config").select("value").eq("key", "usdt_address").single();
  const address = String(cfg?.value ?? "").trim();
  if (cfgErr || !address) return json({ error: "Falta configurar usdt_address" }, 500);

  // Depósitos pendientes
  const { data: pending, error: pErr } = await db
    .from("deposits")
    .select("id, amount, created_at, expires_at")
    .eq("status", "esperando")
    .order("created_at");
  if (pErr) return json({ error: pErr.message }, 500);

  let credited = 0;

  if (pending && pending.length) {
    const minTs = Date.parse(pending[0].created_at) - 60_000;
    const url = new URL(`https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`);
    url.searchParams.set("only_to", "true");
    url.searchParams.set("only_confirmed", "true");
    url.searchParams.set("contract_address", USDT_CONTRACT);
    url.searchParams.set("min_timestamp", String(minTs));
    url.searchParams.set("limit", "200");

    const apiKey = Deno.env.get("TRONGRID_API_KEY");
    const res = await fetch(url, { headers: apiKey ? { "TRON-PRO-API-KEY": apiKey } : {} });
    if (!res.ok) return json({ error: `TronGrid respondió ${res.status}` }, 502);
    const txs: Trc20Tx[] = (await res.json()).data ?? [];

    // TXIDs ya usados
    const ids = txs.map((t) => t.transaction_id);
    const used = new Set<string>();
    if (ids.length) {
      const { data: u } = await db.from("deposits").select("txid").in("txid", ids);
      u?.forEach((r) => r.txid && used.add(r.txid));
    }

    const open = pending.map((d) => ({ ...d, done: false }));

    for (const tx of txs) {
      if (used.has(tx.transaction_id)) continue;
      if (tx.to !== address) continue;
      if (tx.token_info?.address !== USDT_CONTRACT) continue;

      const decimals = Number(tx.token_info?.decimals ?? 6);
      const amount = Number(tx.value) / 10 ** decimals;
      const ts = tx.block_timestamp;

      const match = open.find((d) =>
        !d.done &&
        Math.abs(Number(d.amount) - amount) < 0.0000005 &&
        ts >= Date.parse(d.created_at) - 60_000 &&
        ts <= Date.parse(d.expires_at) + GRACE_MS
      );
      if (!match) continue;

      const { data: ok, error } = await db.rpc("credit_deposit", {
        p_deposit: match.id,
        p_txid: tx.transaction_id,
        p_from: tx.from,
        p_received: amount,
      });
      if (!error && ok) {
        match.done = true;
        used.add(tx.transaction_id);
        credited++;
      }
    }
  }

  // Cierra los depósitos viejos sin pago
  await db
    .from("deposits")
    .update({ status: "expirado" })
    .eq("status", "esperando")
    .lt("expires_at", new Date(Date.now() - EXPIRE_AFTER_MS).toISOString());

  return json({ pending: pending?.length ?? 0, credited });
});
