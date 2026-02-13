import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization, admin } from 'better-auth/plugins';
import { bearer } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@baleyui/db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  user: {
    modelName: 'user',
    additionalFields: {
      avatarUrl: { type: 'string', required: false },
    },
    changeEmail: { enabled: false },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  plugins: [
    nextCookies(),
    bearer(),
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
      creatorRole: 'owner',
    }),
    admin(),
  ],
});

export type Session = typeof auth.$Infer.Session;
