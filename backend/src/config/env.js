import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Always read backend/.env regardless of the current working directory.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const required = (key) => {
  const value = process.env[key];
  if (!value || !String(value).trim()) {
    throw new Error(
      `Missing required environment variable "${key}". ` +
        'Copy backend/.env.example to backend/.env and fill it in.'
    );
  }
  return String(value).trim();
};

const optional = (key, fallback) => {
  const value = process.env[key];
  return value && String(value).trim() ? String(value).trim() : fallback;
};

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: Number.parseInt(optional('PORT', '5000'), 10),
  db: {
    url: required('TURSO_DATABASE_URL'),
    authToken: required('TURSO_AUTH_TOKEN'),
  },
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },
  bcryptRounds: Number.parseInt(optional('BCRYPT_ROUNDS', '10'), 10),
  corsOrigins: optional('CORS_ORIGIN', 'http://localhost:3000,http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  seedAdmin: {
    name: optional('SEED_ADMIN_NAME', 'RecipeBox Admin'),
    email: optional('SEED_ADMIN_EMAIL', ''),
    password: optional('SEED_ADMIN_PASSWORD', ''),
  },
  seedSecurityAdmin: {
    name: optional('SEED_SECURITY_NAME', 'RecipeBox Security'),
    email: optional('SEED_SECURITY_EMAIL', ''),
    password: optional('SEED_SECURITY_PASSWORD', ''),
  },
  email: {
    resendApiKey: optional('RESEND_API_KEY', ''),
    from: optional('EMAIL_FROM', 'RecipeBox <onboarding@resend.dev>'),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  },
  ai: {
    serviceUrl: optional('AI_SERVICE_URL', ''),
    serviceToken: optional('AI_SERVICE_TOKEN', ''),
    timeoutMs: Number.parseInt(optional('AI_SERVICE_TIMEOUT_MS', '15000'), 10),
  },
  blockchain: {
    network: optional('BLOCKCHAIN_NETWORK', 'sepolia'),
    rpcUrl: optional('BLOCKCHAIN_RPC_URL', ''),
    contractAddress: optional('BLOCKCHAIN_CONTRACT_ADDRESS', ''),
    chainId: Number.parseInt(optional('BLOCKCHAIN_CHAIN_ID', '11155111'), 10),
  },
};

export const isProduction = config.env === 'production';
