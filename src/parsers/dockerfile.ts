import { createEvidence, type ParseOutput } from "../types.js";
import { lineLocation, stripMatchingQuotes } from "./shared.js";

interface DockerArgument {
  value: string;
  line: number;
}

function substituteArguments(value: string, argumentsMap: Map<string, DockerArgument>): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, plain) => {
    const replacement = argumentsMap.get(braced ?? plain);
    return replacement?.value ?? match;
  });
}

function nodeTagFromImage(image: string): string | null {
  const withoutDigest = image.split("@")[0]!;
  const lastSlash = withoutDigest.lastIndexOf("/");
  const imageName = withoutDigest.slice(lastSlash + 1);
  const colon = imageName.indexOf(":");
  const repository = colon === -1 ? imageName : imageName.slice(0, colon);
  if (repository.toLowerCase() !== "node") return null;
  return colon === -1 ? "latest" : imageName.slice(colon + 1);
}

/** Convert official Node image tags (20-alpine, 20.11.1-bookworm) to semver inputs. */
export function dockerTagToConstraint(tag: string): string {
  const cleaned = stripMatchingQuotes(tag.trim());
  const numeric = cleaned.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (numeric) return [numeric[1], numeric[2], numeric[3]].filter(Boolean).join(".");
  const alias = cleaned.match(/^([A-Za-z][A-Za-z0-9]*)(?:-|$)/)?.[1];
  return alias?.toLowerCase() ?? cleaned;
}

export function parseDockerfile(text: string, file = "Dockerfile"): ParseOutput {
  const evidence: ParseOutput["evidence"] = [];
  const diagnostics: ParseOutput["diagnostics"] = [];
  const argumentsMap = new Map<string, DockerArgument>();
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const argumentMatch = line.match(/^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*|=)([^\s#]+)?/i);
    if (argumentMatch?.[2]) {
      argumentsMap.set(argumentMatch[1], {
        value: stripMatchingQuotes(argumentMatch[2]!),
        line: index + 1,
      });
    }

    const fromMatch = line.match(/^\s*FROM\s+(?:--platform=(?:"[^"]+"|'[^']+'|\S+)\s+)?([^\s]+)(?:\s+AS\s+([A-Za-z0-9_.-]+))?/i);
    if (!fromMatch) continue;
    const rawImage = stripMatchingQuotes(fromMatch[1]!);
    const resolvedImage = substituteArguments(rawImage, argumentsMap);
    const rawTag = nodeTagFromImage(resolvedImage);
    if (rawTag === null) continue;
    const constraint = dockerTagToConstraint(rawTag);
    const stage = fromMatch[2];
    const imageColumn = line.indexOf(fromMatch[1]!) + 1;
    const colonOffset = fromMatch[1]!.lastIndexOf(":");
    const column = imageColumn + (colonOffset >= 0 ? colonOffset + 1 : 0);
    evidence.push(
      createEvidence({
        role: "production",
        source: "docker",
        location: lineLocation(file, index + 1, column),
        raw: rawTag,
        constraint,
        label: `${file} Node base image`,
        context: stage ? `stage ${stage}` : undefined,
      }),
    );
  }

  return { evidence, diagnostics };
}
