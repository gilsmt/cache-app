import "server-only";

import { auth } from "@/lib/auth/server";

export async function deleteUserAccount(
    requestHeaders: Headers
): Promise<void> {
    await auth.api.deleteUser({ body: {}, headers: requestHeaders });
}
