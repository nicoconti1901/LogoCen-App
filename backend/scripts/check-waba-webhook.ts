import "dotenv/config";

const token = process.env.WHATSAPP_ACCESS_TOKEN;
const apiVersion = process.env.WHATSAPP_API_VERSION ?? "v21.0";
const wabaId = process.argv[2];

if (!token) {
  console.error("Falta WHATSAPP_ACCESS_TOKEN en .env");
  process.exit(1);
}

async function getJson(url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return { status: res.status, data };
}

if (wabaId) {
  const subscribed = await getJson(
    `https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`
  );
  console.log("WABA subscribed_apps:", JSON.stringify(subscribed, null, 2));

  if (subscribed.status === 200 && !subscribed.data?.data?.length) {
    console.log("\nLa app NO está suscripta a la WABA. Suscribiendo...");
    const sub = await fetch(`https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("subscribe status:", sub.status, await sub.text());
  }
} else {
  console.log("Uso: npx tsx scripts/check-waba-webhook.ts WABA_ID");
  console.log("Ejemplo WABA del cliente: 25321694374195241");
}

const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
if (phoneId) {
  const phone = await getJson(
    `https://graph.facebook.com/${apiVersion}/${phoneId}?fields=id,display_phone_number,verified_name`
  );
  console.log("\nPhone number ID:", JSON.stringify(phone, null, 2));
}

console.log("\nWebhook local: http://localhost:4000/webhooks/whatsapp");
console.log("Con ngrok: https://TU-URL.ngrok-free.dev/webhooks/whatsapp");
console.log("Al tocar el botón, en la terminal del backend debería verse:");
console.log('  [whatsapp webhook] recibido { messageTypes: ["interactive"] }');
console.log('  [whatsapp] botón confirmación { ... ok: true }');
