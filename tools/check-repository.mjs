import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

// Inspect versionable files only. Local secrets/builds must remain ignored.
const files = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const prohibited = /(^|\/)(node_modules|target|dist|build|\.deploy|\.ssh)(\/|$)|(^|\/)[^/]*(?:secret|credential)[^/]*(?:\/|$)|(^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519))$|\.(?:pem|key|p8|p12|pfx|keystore|jks|jar|class|log)$/;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_[A-Za-z0-9_]{50,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[0-9A-Za-z-]{20,}/,
  /https?:\/\/[^\s/:]+:[^\s/@]+@/,
  // Match literal-looking values, not code that loads a value or generates a fresh test credential.
  /(?:^|[^A-Za-z0-9])(?:password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\b\s*(?:=\s*|:\s+)["']?(?!local-development-only\b|\$|<|TBD\b|CHANGE_ME\b|(?:process|document|cursor|login|ui|hasher|randomBytes)\s*(?:\.|\())[^\s"'`,;}]{12,}/i,
];
const approvedAvatarBinary = /^apps\/client\/public\/assets\/avatar\/v1\/sheets\/hh_human_(?:body|face|hair|leg|shirt|shoe)\.png$/u;
const approvedLoginThemeBinary = /^apps\/web\/public\/themes\/(?:neon-purple|tropical-blue|sunset-pink|cosmic-blue)\.webp$/u;
let problems = 0;
for (const file of files) {
  const name = file.split('/').at(-1);
  const envFile = (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) && name !== '.env.example';
  if (prohibited.test(file) || envFile || file === 'registro.md') {
    console.error(`Forbidden repository file: ${file}`);
    problems++;
    continue;
  }
  let stat;
  try { stat = statSync(file); } catch { continue; } // A tracked deletion has no content to scan.
  if (!stat.isFile()) continue;
  if (stat.size > 1024 * 1024) {
    console.error(`File exceeds bootstrap 1 MiB review limit: ${file}`);
    problems++;
    continue;
  }
  const content = readFileSync(file);
  if (content.includes(0) && !approvedAvatarBinary.test(file) && !approvedLoginThemeBinary.test(file)) {
    console.error(`Unexpected binary: ${file}`);
    problems++;
  } else if (secretPatterns.some(pattern => pattern.test(content.toString('utf8')))) {
    console.error(`Possible secret in ${file}; value deliberately omitted`);
    problems++;
  }
}
if (problems) process.exitCode = 1;
else console.log(`Repository hygiene: ${files.length} files checked; no forbidden artifacts or known secret patterns. Manual review still required.`);
