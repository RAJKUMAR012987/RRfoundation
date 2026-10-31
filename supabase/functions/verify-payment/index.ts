import { withSupabase } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, apiKey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (req, ctx) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
      }

      if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
      }

      try {
        const keyId = Deno.env.get("RAZORPAY_KEY_ID");
        const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

	console.log("VERIFY Razorpay configuration:", {
 		hasKeyId: Boolean(keyId),
  		hasKeySecret: Boolean(keySecret),
	});

        if (!keyId || !keySecret) {
          console.error("Razorpay credentials are missing.");
          return jsonResponse(
            { error: "Payment service is not configured." },
            500,
          );
        }

        const body = await req.json();

        const orderId = String(body.orderId ?? "");
        const paymentId = String(body.paymentId ?? "");
        const signature = String(body.signature ?? "");
        const donorEmail = body.donorEmail
          ? String(body.donorEmail).trim().toLowerCase()
          : null;

        if (!orderId || !paymentId || !signature) {
          return jsonResponse(
            { error: "Missing payment verification details." },
            400,
          );
        }

        // Step 1: Verify Razorpay signature.
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(keySecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );

        const signatureBuffer = await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${orderId}|${paymentId}`),
        );

        const expectedSignature = toHex(signatureBuffer);

        if (!safeEqual(expectedSignature, signature.toLowerCase())) {
          return jsonResponse(
            { error: "Payment signature verification failed." },
            400,
          );
        }

        const authorization =
          `Basic ${btoa(`${keyId}:${keySecret}`)}`;

        // Step 2: Retrieve the order from Razorpay.
        const orderResponse = await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`,
          {
            headers: { Authorization: authorization },
          },
        );

        if (!orderResponse.ok) {
          console.error("Unable to retrieve Razorpay order.");
          return jsonResponse(
            { error: "Unable to confirm payment order." },
            502,
          );
        }

        const order = await orderResponse.json();

        // Step 3: Retrieve the payment from Razorpay.
        const paymentResponse = await fetch(
          `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
          {
            headers: { Authorization: authorization },
          },
        );

        if (!paymentResponse.ok) {
          console.error("Unable to retrieve Razorpay payment.");
          return jsonResponse(
            { error: "Unable to confirm payment details." },
            502,
          );
        }

        const payment = await paymentResponse.json();

        // Step 4: Confirm order, payment and amount match.
        if (
          payment.order_id !== orderId ||
          payment.amount !== order.amount ||
          payment.currency !== "INR" ||
          order.currency !== "INR"
        ) {
          return jsonResponse(
            { error: "Payment details do not match the order." },
            400,
          );
        }

        if (payment.status !== "captured") {
          return jsonResponse(
            {
              error: "Payment is not captured yet.",
              paymentStatus: payment.status,
            },
            409,
          );
        }

        const category = order.notes?.category;

        if (
          !["education", "health", "women", "hunger"].includes(category)
        ) {
          return jsonResponse(
            { error: "Invalid donation category." },
            400,
          );
        }

        // Step 5: Save the verified payment using Supabase admin access.
        const { error: dbError } = await ctx.supabaseAdmin
          .from("donation_payments")
          .upsert(
            {
              payment_id: paymentId,
              order_id: orderId,
              amount: payment.amount,
              currency: payment.currency,
              status: "captured",
              method: payment.method ?? null,
              donor_email: donorEmail,
              category,
              paid_at: new Date(
                payment.created_at * 1000,
              ).toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "payment_id" },
          );

        if (dbError) {
          console.error("Donation database update failed:", dbError);
          return jsonResponse(
            { error: "Payment received, but donation record could not be saved." },
            500,
          );
        }

        console.log("Donation verified:", paymentId);

        return jsonResponse({
          verified: true,
          paymentId,
          amount: payment.amount / 100,
          currency: payment.currency,
          category,
        });
      } catch (error) {
        console.error("Payment verification error:", error);

        return jsonResponse(
          { error: "Payment verification could not be completed." },
          500,
        );
      }
    },
  ),
};