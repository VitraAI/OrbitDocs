/** Edge-safe pieces (no Node APIs): verify a session and decide access. For Next proxy / middleware. */
export * from './manifest';
export { canSignIn, isAllowed, matches, requiredGroups, resolveGroups, sitePath, variantPathname, variesByReader } from './match';
export { implies, requirement, requirementKey } from './requirement';
export { planVariants, type VariantItem, type VariantPlan } from './variants';
export { SESSION_COOKIE, readCookie, verifySession } from './session';
export { buildManifest, type ManifestInput, markdownPath, markdownPattern, type RestrictedPage } from './build-manifest';
