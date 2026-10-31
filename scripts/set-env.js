const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;

if (!supabaseUrl || !supabaseKey || !razorpayKeyId) {
  throw new Error('Missing required environment variables!');
}

const config = `export const environment = {
  production: true,
  supabaseUrl: ${JSON.stringify(supabaseUrl)},
  supabaseKey: ${JSON.stringify(supabaseKey)},
  razorpayKeyId: ${JSON.stringify(razorpayKeyId)}
};
`;

fs.writeFileSync('src/environments/prod.ts', config);

console.log('Production environment configured successfully!');