# Security policy

## Supported versions

RuntimeTruth is pre-1.0 software. Security fixes are applied to the latest published release only.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

## Report a vulnerability privately

Please use [GitHub private vulnerability reporting](https://github.com/flowzygames/runtime-truth/security/advisories/new). Do not open a public issue, discussion, or pull request for a suspected vulnerability.

Include, when possible:

- the affected version;
- the operating system and Node.js version;
- a minimal proof of concept;
- the impact you believe is possible;
- any suggested mitigation;
- whether the report or its details may be credited publicly.

You should receive an acknowledgement within 7 days. We will then validate the report, coordinate a fix and disclosure timeline, and keep you updated as the investigation progresses.

## Security model

RuntimeTruth reads repository configuration and prints diagnostics. It does not need network access, execute Dockerfiles or workflow steps, upload source code, or collect telemetry. A parsing bug can still matter when untrusted repositories are checked in automated environments, so crashes, path traversal, command execution, unsafe archive handling, and terminal escape injection are treated as security-sensitive.

When running any developer tool against a repository you do not trust, use an isolated environment and a least-privileged token.
