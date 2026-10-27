import path from "node:path";

/** .env, .env.local, .env.production ... but not .env.example */
const SECRET_FILE = /(^|[\\/])\.env(\.(?!example$)[^\\/]+)?$/i;
/** A search glob/pattern that targets .env files, e.g. "**\/.env*" or ".env.local". */
const SECRET_GLOB = /(^|[\\/*])\.env(?!\.example)(\b|\*|\.|$)/i;
/** A .env file named inside a shell command: `cat .env.local`, `grep KEY ./.env`. */
const SECRET_IN_COMMAND = /(^|[\s'"/\\<])\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s'"|;&>)*])/i;
/** Commands that dump the whole environment. */
const ENV_DUMP = /^(printenv|env|set|export(\s+-p)?|declare\s+-x|Get-ChildItem\s+env:)(\s|$)/i;
/** Expanding a variable whose name looks like a credential: `echo $ANTHROPIC_API_KEY`. */
const SECRET_VAR = /\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)\w*\}?|\$env:\w*(KEY|TOKEN|SECRET|PASSWORD)/i;

export function isSecretPath(p: string): boolean {
  return SECRET_FILE.test(path.normalize(p));
}

export function isSecretGlob(pattern: string): boolean {
  return SECRET_GLOB.test(pattern);
}

/** True when a shell segment would print a secret file or credential variable. */
export function exposesSecret(segment: string): boolean {
  const s = segment.trim();
  if (/^printenv\b/i.test(s)) return true;
  return SECRET_IN_COMMAND.test(s) || ENV_DUMP.test(s) || SECRET_VAR.test(s);
}
