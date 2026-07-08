// Displayed app version (small badge under the header brand mark).
// Sourced from package.json at build time so it always reflects the built
// version — bump the "version" field there and the badge follows.
import { version } from "../package.json";

export const APP_VERSION = version;
