import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: process.env.PORT || 3000,
  databaseUrl: required('DATABASE_URL'),
  keetaClientId: required('KEETA_CLIENT_ID'),
  keetaClientSecret: required('KEETA_CLIENT_SECRET'),
  keetaBaseUrl: process.env.KEETA_BASE_URL || 'https://open.mykeeta.com/api/open/opendelivery',
  webhookSecret: process.env.WEBHOOK_SECRET || null,
};
