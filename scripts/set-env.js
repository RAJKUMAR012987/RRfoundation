const fs = require('fs');

const required = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'RAZORPAY_KEY_ID'
];

const missing = required.filter(
  key => !process.env[key]
);

if (missing.length > 0) {
  throw new Error(
    `Missing Vercel environment variables: ${missing.join(', ')}`
  );
}

const config = `export const environment = {
  production: true,
  supabaseUrl: ${JSON.stringify(process.env.SUPABASE_URL)},
  supabaseKey: ${JSON.stringify(process.env.SUPABASE_PUBLISHABLE_KEY)},
  razorpayKeyId: ${JSON.stringify(process.env.RAZORPAY_KEY_ID)}
};
`;

fs.writeFileSync('src/environments/prod.ts', config);

console.log('Production environment configured successfully!');