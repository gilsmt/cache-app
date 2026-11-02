/**
 * Disables region detection for static site generation.
 * @see https://generaltranslation.com/en-US/docs/react/nextjs/app-router-static-site-generation#region
 */
export default function getRegion() {
    return Promise.resolve(undefined);
}
