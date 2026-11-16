import { stripeClient } from "@better-auth/stripe/client";
import {
    inferAdditionalFields,
    multiSessionClient,
    oneTapClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { clientEnv } from "@/env/client";
import type { auth } from "@/lib/auth/server";

export const GOOGLE_ONE_TAP_CLIENT_ID =
    clientEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();

export const authClient = createAuthClient({
    plugins: [
        inferAdditionalFields<typeof auth>(),
        multiSessionClient(),
        stripeClient({ subscription: true }),
        // The plugin also clears FedCM credential state on sign-out.
        ...(GOOGLE_ONE_TAP_CLIENT_ID
            ? [oneTapClient({ clientId: GOOGLE_ONE_TAP_CLIENT_ID })]
            : []),
    ],
});

export const { signIn, signOut, useSession } = authClient;
