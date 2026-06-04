/**
 * Verifica token + IDs de WhatsApp y ayuda a detectar si WABA/Phone están invertidos.
 */
import "dotenv/config";

const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
const apiVersion = process.env.WHATSAPP_API_VERSION ?? "v21.0";
const phoneIdEnv = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
const wabaIdEnv = process.env.WHATSAPP_WABA_ID?.trim();

if (!token) {
  console.error("✗ Falta WHATSAPP_ACCESS_TOKEN en backend/.env");
  process.exit(1);
}

async function getJson(url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return { status: res.status, data };
}

type ProbeResult = { id: string; kind: string; detail: string };

async function probeId(id: string): Promise<ProbeResult> {
  const asPhone = await getJson(
    `https://graph.facebook.com/${apiVersion}/${id}?fields=id,display_phone_number,verified_name`
  );
  if (asPhone.status === 200 && asPhone.data?.display_phone_number) {
    return {
      id,
      kind: "PHONE_NUMBER_ID",
      detail: String(asPhone.data.display_phone_number),
    };
  }

  const phonesEdge = await getJson(
    `https://graph.facebook.com/${apiVersion}/${id}/phone_numbers?fields=id,display_phone_number,verified_name`
  );
  if (phonesEdge.status === 200 && phonesEdge.data?.data?.length) {
    const lines = (phonesEdge.data.data as Array<{ id: string; display_phone_number?: string }>)
      .map((p) => `${p.display_phone_number ?? "?"} → id ${p.id}`)
      .join("; ");
    return { id, kind: "WABA_ID", detail: lines };
  }

  const nested = await getJson(
    `https://graph.facebook.com/${apiVersion}/${id}?fields=phone_numbers{id,display_phone_number,verified_name}`
  );
  const nestedList = nested.data?.phone_numbers?.data;
  if (nested.status === 200 && nestedList?.length) {
    const lines = (nestedList as Array<{ id: string; display_phone_number?: string }>)
      .map((p) => `${p.display_phone_number ?? "?"} → id ${p.id}`)
      .join("; ");
    return { id, kind: "WABA_ID", detail: lines };
  }

  const err =
    asPhone.data?.error?.message ??
    phonesEdge.data?.error?.message ??
    nested.data?.error?.message ??
    "desconocido";
  return { id, kind: "DESCONOCIDO", detail: err };
}

console.log("=== Verificación WhatsApp LogoCen ===\n");

const me = await getJson(`https://graph.facebook.com/${apiVersion}/me?fields=id`);
if (me.status !== 200) {
  console.error("✗ Token inválido:", me.data?.error?.message);
  process.exit(1);
}
console.log("✓ Token válido\n");

const debug = await getJson(
  `https://graph.facebook.com/${apiVersion}/debug_token?input_token=${encodeURIComponent(token!)}`
);
if (debug.status === 200 && debug.data?.data) {
  const d = debug.data.data as {
    app_id?: string;
    type?: string;
    expires_at?: number;
    scopes?: string[];
    granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
  };
  console.log("Token:", d.type ?? "?", "| app_id:", d.app_id ?? "?");
  if (d.expires_at) {
    const exp = new Date(d.expires_at * 1000);
    console.log("Vence:", exp.toISOString(), exp < new Date() ? "(EXPIRADO)" : "");
  }
  const waScopes = (d.granular_scopes ?? []).filter((g) => g.scope?.includes("whatsapp"));
  const wabaIdsFromToken = [
    ...new Set(waScopes.flatMap((g) => g.target_ids ?? [])),
  ];
  if (waScopes.length) {
    console.log("\nActivos WhatsApp en este token (target_ids):");
    for (const g of waScopes) {
      console.log(`  · ${g.scope}:`, (g.target_ids ?? []).join(", ") || "(sin id)");
    }
  }

  if (wabaIdsFromToken.length) {
    console.log("\n--- Números que ESTE token puede usar (por WABA) ---\n");
    type ListedPhone = { id: string; display_phone_number?: string; verified_name?: string };
    const allListed: ListedPhone[] = [];
    for (const wabaId of wabaIdsFromToken) {
      const phones = await getJson(
        `https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`
      );
      if (phones.status !== 200 || !phones.data?.data?.length) {
        console.log(`WABA ${wabaId}: (sin números o sin permiso)`);
        continue;
      }
      for (const p of phones.data.data as ListedPhone[]) {
        allListed.push(p);
        const mark = phoneIdEnv && p.id === phoneIdEnv ? " ← coincide con .env" : "";
        console.log(
          `  ${p.display_phone_number ?? "?"} (${p.verified_name ?? "?"}) → id ${p.id}${mark}`
        );
      }
    }
    if (phoneIdEnv && !allListed.some((p) => p.id === phoneIdEnv)) {
      console.log(
        `\n⚠ WHATSAPP_PHONE_NUMBER_ID=${phoneIdEnv} NO está en ninguna WABA de este token.`
      );
      console.log(
        "  El .env puede estar bien (como en la otra PC), pero el token que pegaste acá es de otra cuenta."
      );
      console.log(
        "  Solución: copiá el mismo WHATSAPP_ACCESS_TOKEN de la PC que funcionó, o generá uno nuevo"
      );
      console.log(
        "  con API Setup → cuenta «Recordatorio» seleccionada arriba antes de Generate."
      );
      if (allListed.length === 1 && allListed[0].display_phone_number?.includes("555")) {
        console.log(
          "  Este token solo ve el +1 555 de prueba; el 221 está en otra WABA (Recordatorio)."
        );
      }
    }
  }
}

const idsToProbe = [...new Set([phoneIdEnv, wabaIdEnv].filter(Boolean))] as string[];
if (idsToProbe.length === 0) {
  console.log("\n⚠ Definí WHATSAPP_PHONE_NUMBER_ID y/o WHATSAPP_WABA_ID en .env");
  process.exit(1);
}

console.log("\n--- Qué es cada ID del .env ---\n");
const probes: ProbeResult[] = [];
for (const id of idsToProbe) {
  const r = await probeId(id);
  probes.push(r);
  const icon = r.kind === "PHONE_NUMBER_ID" ? "📱" : r.kind === "WABA_ID" ? "📋" : "❓";
  console.log(`${icon} ${id}`);
  console.log(`   Tipo: ${r.kind}`);
  console.log(`   ${r.detail}\n`);
}

const phoneProbe = probes.find((p) => p.id === phoneIdEnv);
const wabaProbe = probes.find((p) => p.id === wabaIdEnv);

console.log("--- Recomendación ---\n");

if (phoneProbe?.kind === "PHONE_NUMBER_ID") {
  console.log(`✓ WHATSAPP_PHONE_NUMBER_ID=${phoneIdEnv} es correcto (${phoneProbe.detail})`);
} else if (wabaProbe?.kind === "PHONE_NUMBER_ID") {
  console.log(`⚠ Intercambiá: el Phone number ID real es ${wabaIdEnv} (${wabaProbe.detail})`);
  console.log(`  WHATSAPP_PHONE_NUMBER_ID=${wabaIdEnv}`);
} else if (phoneProbe?.kind === "WABA_ID") {
  console.log(`⚠ ${phoneIdEnv} es WABA, no número. Buscá en la lista el id del 221:`);
  console.log(`  ${phoneProbe.detail}`);
} else {
  console.log("✗ Ningún ID del .env es accesible con este token.");
  console.log("\nHacé esto en Meta:");
  console.log("  1. developers.facebook.com → LogoCen-App → WhatsApp → API Setup");
  console.log("  2. Elegí cuenta «LogoCen Consultorios Medicos Recordatorio»");
  console.log("  3. Generate access token (marcá permisos whatsapp)");
  console.log("  4. Copiá Phone number ID del bloque del 221 (no el +1 555)");
  console.log("\nEl WABA ID no es el «identificador del activo» del portfolio:");
  console.log("  · Portfolio / business asset ≠ WABA");
  console.log("  · WABA ID: WhatsApp Manager → configuración de la cuenta, o lista arriba si probe detecta WABA");
}

if (wabaProbe?.kind === "WABA_ID" && wabaIdEnv) {
  console.log(`\n✓ WHATSAPP_WABA_ID=${wabaIdEnv} es WABA`);
  const sub = await getJson(
    `https://graph.facebook.com/${apiVersion}/${wabaIdEnv}/subscribed_apps`
  );
  if (sub.status === 200) {
    const n = sub.data?.data?.length ?? 0;
    console.log(n > 0 ? `✓ App suscripta (${n})` : "⚠ App NO suscripta — ejecutá: npm run whatsapp:check-webhook " + wabaIdEnv);
  }
} else if (phoneProbe?.kind === "WABA_ID" && phoneIdEnv) {
  console.log(`\n✓ WHATSAPP_WABA_ID debería ser ${phoneIdEnv}`);
}

console.log("\nLuego: npm run whatsapp:real-test\n");
