import { locale } from "next/root-params";
import config from "./gt.config.json" with { type: "json" };

export default async function getLocale() {
    const current = await locale();

    if (current && config.locales.includes(current)) {
        return current;
    }

    return config.defaultLocale;
}
