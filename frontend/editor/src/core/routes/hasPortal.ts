/**
 * Whether this build ships the processor, and so has a second app to switch to.
 *
 * Its own module, like PORTAL_BASENAME beside it, so core can ask the question
 * without importing the route set - which references portal code that builds
 * shipping no portal must never resolve. Shadowed by each build that answers
 * differently.
 */
export const HAS_PORTAL = false;
