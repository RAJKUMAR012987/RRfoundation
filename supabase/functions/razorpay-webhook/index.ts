
import { withSupabase } from "@supabase/server";

const paymentCategories = new Set([
  "education",
  "health",
  "women",
  "hunger",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeHex(value: string): Uint8Array | null {
  if (!/^[a-f\d]{64}$/i.test(value)) return null;

  const bytes = new Uint8Array(32);

  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  let mismatch = 0;

  for (let i = 0; i < left.length; i++) {
    mismatch |= left[i] ^ right[i];
  }

  return mismatch === 0;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function getCategory(value: unknown): string | null {
  if (
    typeof value === "string" &&
    paymentCategories.has(value)
  ) {
    return value;
  }

  return null;
}

export default {
  fetch: withSupabase(
    { auth: "none" },
    async (request, context) => {
      if (request.method !== "POST") {
        return jsonResponse(
          { error: "Method not allowed." },
          405,
        );
      }

      const webhookSecret = Deno.env.get(
        "RAZORPAY_WEBHOOK_SECRET",
      );

      const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
      const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

      if (!webhookSecret) {
        console.error("Webhook secret is not configured.");

        return jsonResponse(
          { error: "Webhook is not configured." },
          503,
        );
      }

      const signature = request.headers.get(
        "x-razorpay-signature",
      );

      const providedSignature = signature
        ? decodeHex(signature)
        : null;

      if (!providedSignature) {
        return jsonResponse(
          { error: "Invalid webhook signature." },
          400,
        );
      }

      // Verify the exact raw request body before parsing JSON.
      const rawBody = await request.arrayBuffer();

      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const expectedSignature = new Uint8Array(
        await crypto.subtle.sign("HMAC", key, rawBody),
      );

      if (!safeEqual(expectedSignature, providedSignature)) {
        return jsonResponse(
          { error: "Webhook signature verification failed." },
          400,
        );
      }

      let payload: unknown;

      try {
        payload = JSON.parse(
          new TextDecoder().decode(rawBody),
        );
      } catch {
        return jsonResponse(
          { error: "Invalid webhook payload." },
          400,
        );
      }

      if (
        !isRecord(payload) ||
        typeof payload["event"] !== "string"
      ) {
        return jsonResponse(
          { error: "Invalid webhook payload." },
          400,
        );
      }

      // This function currently processes captured payments.
      if (payload["event"] !== "payment.captured") {
        return jsonResponse({ received: true });
      }

      const eventPayload = payload["payload"];

      const paymentContainer =
        isRecord(eventPayload) &&
        isRecord(eventPayload["payment"])
          ? eventPayload["payment"]
          : null;

      const payment =
        paymentContainer &&
        isRecord(paymentContainer["entity"])
          ? paymentContainer["entity"]
          : null;

      if (
        !payment ||
        typeof payment["id"] !== "string" ||
        typeof payment["amount"] !== "number" ||
        !Number.isSafeInteger(payment["amount"]) ||
        payment["amount"] <= 0 ||
        typeof payment["currency"] !== "string" ||
        payment["status"] !== "captured"
      ) {
        return jsonResponse(
          { error: "Captured payment details are invalid." },
          400,
        );
      }

      const paymentId = payment["id"];

      const orderId =
        typeof payment["order_id"] === "string"
          ? payment["order_id"]
          : null;

      const paymentNotes = isRecord(payment["notes"])
        ? payment["notes"]
        : {};

      let category = getCategory(paymentNotes["category"]);

      // Payment notes may not contain the category.
      // Retrieve it from Razorpay order notes instead.
      if (!category && orderId && razorpayKeyId && razorpayKeySecret) {
        try {
          const credentials = btoa(
            `${razorpayKeyId}:${razorpayKeySecret}`,
          );

          const orderResponse = await fetch(
            `https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`,
            {
              headers: {
                Authorization: `Basic ${credentials}`,
              },
            },
          );

          if (orderResponse.ok) {
            const order = await orderResponse.json();

            if (isRecord(order) && isRecord(order["notes"])) {
              category = getCategory(order["notes"]["category"]);
            }
          } else {
            console.error(
              "Could not retrieve Razorpay order:",
              orderResponse.status,
            );
          }
        } catch (error) {
          console.error("Razorpay order lookup failed:", error);
        }
      }

      const paidAt =
        typeof payment["created_at"] === "number" &&
        Number.isFinite(payment["created_at"])
          ? new Date(
              payment["created_at"] * 1000,
            ).toISOString()
          : new Date().toISOString();

      const { error } = await context.supabaseAdmin
        .from("donation_payments")
        .upsert(
          {
            payment_id: paymentId,
            order_id: orderId,
            amount: payment["amount"] / 100,
            currency: payment["currency"],
            status: "SUCCESS",
            method:
              typeof payment["method"] === "string"
                ? payment["method"]
                : null,
            donor_email:
              typeof payment["email"] === "string"
                ? payment["email"]
                : null,
            category,
            paid_at: paidAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "payment_id" },
        );

      if (error) {
        console.error(
          "Could not save captured Razorpay payment:",
          error,
        );

        return jsonResponse(
          { error: "Could not save captured payment." },
          500,
        );
      }

      console.log("Captured payment saved:", paymentId);

      return jsonResponse({
        received: true,
        paymentId,
        status: "SUCCESS",
      });
    },
  ),
};
