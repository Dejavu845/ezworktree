/** Minimal gitignore-style matcher: *, **, ?, and trailing slash as directory. */

function escapeRegExp(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

export function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, "/").replace(/^\/+/, "");
  let source = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === "*" && normalized[i + 1] === "*") {
      const next = normalized[i + 2];
      if (next === "/" || next === undefined) {
        source += next === "/" ? "(?:.*/)?" : ".*";
        i += next === "/" ? 2 : 1;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  if (normalized.endsWith("/")) {
    source += ".*";
  }
  source += "$";
  return new RegExp(source);
}

export function matchesGlob(filePath: string, pattern: string): boolean {
  const path = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const clean = pattern.replace(/\\/g, "/");
  if (!clean.includes("*") && !clean.includes("?")) {
    return path === clean || path.startsWith(`${clean.replace(/\/$/, "")}/`);
  }
  return globToRegExp(clean).test(path);
}

export function matchesAny(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlob(filePath, pattern));
}
