# Security

Use the latest version from the default branch. There is no long-term support
commitment for older portfolio snapshots.

Do not post API keys, private logs, or exploitable vulnerability details in a
public issue. If this repository has private vulnerability reporting enabled,
use its **Security → Report a vulnerability** form. Otherwise, use a private
contact method listed on the maintainer's GitHub profile.

## Data boundary

- Samples require no credentials and make no request to Groq.
- Live mode sends the report and retrieved source text to Groq through a fixed
  HTTPS endpoint. Keys are never included in prompts or saved briefs.
- Browser-entered keys live in memory and are cleared by a page refresh.
- History is stored in the browser. Clear it before using a shared machine.
- Uploaded filenames are labels; the server never opens them as filesystem paths.
- The app does not execute code, proposed commands, or fixes.

A public deployment should use visitors' own keys. Do not expose a shared server
key to public traffic without adding authentication and a server-side quota.
This project does not include those production controls.

`.gitignore` does not remove an already committed secret. Revoke or rotate an
exposed credential, then remove it from the affected Git history before publishing.
The built-in repository check is a convenience, not a complete secret scanner.
