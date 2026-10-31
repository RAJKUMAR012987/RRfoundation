import { withSupabase } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, apiKey, x-client-info, content-type",
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

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (req) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
      }

      if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
      }

      try {
        const keyId = Deno.env.get("RAZORPAY_KEY_ID");
        const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

	console.log("Razorpay configuration check:", {
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
        const amount = Number(body.amount);
        const category = String(body.category ?? "");

        const allowedCategories = [
          "education",
          "health",
          "women",
          "hunger",
        ];

        if (
          !Number.isSafeInteger(amount) ||
          amount < 10 ||
          amount > 1000000
        ) {
          return jsonResponse({ error: "Invalid donation amount." }, 400);
        }

        if (!allowedCategories.includes(category)) {
          return jsonResponse({ error: "Invalid donation category." }, 400);
        }

        const receipt = `rrngo_${crypto.randomUUID().replaceAll("-", "")}`;

        const razorpayResponse = await fetch(
          "https://api.razorpay.com/v1/orders",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount: amount * 100,
              currency: "INR",
              receipt,
              notes: {
                organization: "RRNGO",
                category,
              },
            }),
          },
        );

        const razorpayData = await razorpayResponse.json();

        if (!razorpayResponse.ok) {
          console.error("Razorpay error:", razorpayData);
          return jsonResponse(
            { error: "Unable to create Razorpay order." },
            502,
          );
        }

        return jsonResponse({
          orderId: razorpayData.id,
          keyId,
          amount: razorpayData.amount,
          currency: razorpayData.currency,
        });
      } catch (error) {
        console.error("Order creation error:", error);
        return jsonResponse(
          { error: "Unable to process payment request." },
          500,
        );
      }
    },
  ),
};