# Supabase admin dashboard setup

The admin page is available at `/admin` and is intentionally not linked in the site header.
It uses Supabase email/password sign-in, an email allowlist, row-level security, and private media
storage. Only captured payments verified by the server are shown.

## 1. Configure Supabase

1. Set `supabaseUrl` and the Supabase publishable (formerly anon) key in
   `src/environments/environment.ts`. The publishable key is public; database policies must stay
   enabled.
2. Run `migrations/202610300001_admin_dashboard.sql` in the Supabase SQL editor.
3. Run `migrations/202610310001_home_belief.sql` to enable editing the Home page belief section.
4. Create an administrator user in Supabase Auth. Then authorize the account in the SQL editor:

   ```sql
   insert into public.admin_emails (email)
   values (lower('admin@example.com'));
   ```

5. Disable public sign-ups in Supabase Auth. Create administrator accounts directly in Supabase.

The admin email allowlist is empty by default, so no account can access administrative data until
an email is added.

After applying both migrations, an authorized administrator can edit the Home page's **Our belief**
eyebrow, heading, description, and approach link at `/admin`. The published Home page reads this
content from Supabase; the current copy remains as a fallback if the public content request fails.

## 2. Configure server-only secrets

For local development, create a root `.env` file and set the server variables below. The server
loads `.env` on startup; restart `ng serve` after changing it. Never commit `.env` or put the
service role key or Razorpay secrets in Angular source, browser environment files, or a
`NEXT_PUBLIC`/client-prefixed variable.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Set the public Razorpay Key ID in `razorpayKeyId` in
`src/environments/environment.ts`. Use the same Key ID in the server `.env` as `RAZORPAY_KEY_ID`.
The key ID is public and is used by Razorpay Checkout in the browser; `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` must remain server-only.

The Angular application uses the Supabase URL, publishable key, and Razorpay Key ID from
`environment.ts`; server routes use the environment variables above. Run the built SSR server
(not a static-only hosting target) so the payment API routes are available.

If using the Supabase Edge Functions under `supabase/functions` instead of the local SSR API,
set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` as Supabase function secrets, and deploy both
functions with the project configuration:

```powershell
supabase secrets set --project-ref <project-ref> RAZORPAY_KEY_ID=<test-key-id> RAZORPAY_KEY_SECRET=<test-key-secret>
supabase functions deploy create-payment-order --project-ref <project-ref>
supabase functions deploy verify-payment --project-ref <project-ref>
```

The function config disables the gateway JWT check and the function itself validates the project
publishable key from the `apikey` request header. After deploying, ensure the frontend uses a
publishable key belonging to the same Supabase project. Never store Razorpay secrets in function
source or Angular environment files.

## 3. Configure Razorpay payment verification and webhook

The browser uses the Supabase Edge Functions to create orders and verify the checkout signature.
The verification function checks the payment with Razorpay and writes the verified record to
`donation_payments`. The admin page reads that table and only its authorized Supabase admins can
see the rows.

Deploy the Edge Functions and set the Razorpay credentials as function secrets:

```powershell
supabase secrets set --project-ref <project-ref> RAZORPAY_KEY_ID=<test-key-id> RAZORPAY_KEY_SECRET=<test-key-secret> RAZORPAY_WEBHOOK_SECRET=<webhook-secret>
supabase functions deploy create-payment-order --project-ref <project-ref>
supabase functions deploy verify-payment --project-ref <project-ref>
supabase functions deploy razorpay-webhook --project-ref <project-ref>
```

In the Razorpay Dashboard, configure the webhook:

1. Open **Account & Settings → Webhooks → Add New Webhook**.
2. Set the URL to
   `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`. Do not use `localhost` or the
   `create-payment-order` URL.
3. Subscribe to `payment.captured`.
4. Create a webhook secret and set exactly the same value as `RAZORPAY_WEBHOOK_SECRET` in the
   Supabase Edge Function secrets above.

The webhook function validates Razorpay's `x-razorpay-signature` against the raw request body
before upserting the captured payment into Supabase. Repeated webhook deliveries are safe because
payments are upserted by payment ID. The Angular SSR server also has an `/api/payments/webhook`
endpoint if you prefer to host that server publicly; configure the Razorpay URL to that endpoint
and set `RAZORPAY_WEBHOOK_SECRET` in the SSR server environment instead, not both.

The admin dashboard reads payment records from `donation_payments`; after the migration is applied
and either verification path writes a captured payment, sign in at `/admin` and use **Refresh**.
The dashboard stores amount in paise, payment/order IDs, status, payment method, cause, timestamp,
and donor email; it does not store PAN or phone numbers.

## 4. Publish content

Photos, videos, and quotes uploaded through `/admin` are drafts. Admins can publish them to the
Projects page or keep them private. The newest published video is also used as the Home page hero
background and plays muted on a loop; unpublishing it restores the default Home image. Media is
stored in a private bucket; the app issues signed URLs only for content the visitor or admin is
permitted to read.
