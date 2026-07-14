import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

export interface ArchitectureViolation {
  file: string;
  message: string;
}

const ROOT = process.cwd();
const PURE_PACKAGES = new Set(['sim', 'content', 'protocol', 'rug-pull-rumble-core']);
const PURE_ALLOWED: Readonly<Record<string, readonly string[]>> = {
  sim: [],
  protocol: [],
  content: ['@rpr/sim'],
  'rug-pull-rumble-core': ['@rpr/content', '@rpr/protocol', '@rpr/sim'],
};
const BROWSER_GLOBALS = new Set([
  'window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement',
  'KeyboardEvent', 'PointerEvent', 'TouchEvent', 'localStorage', 'sessionStorage',
]);

export function scanArchitecture(root = ROOT): ArchitectureViolation[] {
  const files = [
    ...sourceFiles(resolve(root, 'apps')),
    ...sourceFiles(resolve(root, 'packages')),
  ];
  return [
    ...files.flatMap((file) => inspectSource(file, root)),
    ...scanPackageManifests(root),
  ];
}

export function inspectSource(file: string, root = ROOT): ArchitectureViolation[] {
  const source = readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const projectPath = normalize(relative(root, file));
  const violations: ArchitectureViolation[] = [];
  const imports: string[] = [];

  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      imports.push(node.arguments[0].text);
    }
    if (isPurePackage(projectPath) && ts.isIdentifier(node) && BROWSER_GLOBALS.has(node.text)) {
      violations.push({ file: projectPath, message: `Pure package references browser global ${node.text}` });
    }
    if (isConditional(node) && node.expression && !allowsRprKnowledge(projectPath)
      && containsRprIdentity(node.expression)) {
      violations.push({
        file: projectPath,
        message: 'RPR-specific branching is allowed only in RPR-owned code or explicit registries',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  for (const specifier of imports) {
    const message = forbiddenImport(projectPath, specifier, file, root);
    if (message) violations.push({ file: projectPath, message });
  }
  return unique(violations);
}

function forbiddenImport(
  projectPath: string,
  specifier: string,
  absoluteFile: string,
  root: string,
): string | null {
  const packageName = packageSegment(projectPath);
  const resolved = specifier.startsWith('.')
    ? normalize(relative(root, resolve(dirname(absoluteFile), specifier)))
    : null;

  if (PURE_PACKAGES.has(packageName)) {
    if (specifier === 'phaser' || specifier.startsWith('node:') || resolved?.startsWith('apps/')) {
      return `Pure package cannot import ${specifier}`;
    }
    if (specifier.startsWith('@rpr/') && !PURE_ALLOWED[packageName]?.includes(specifier)) {
      return `${packageName} cannot depend on ${specifier}`;
    }
  }

  if (packageName === 'controls') {
    if (specifier === 'phaser' || specifier.startsWith('node:')) return `Controls cannot import ${specifier}`;
    if (specifier.startsWith('@rpr/') && specifier !== '@rpr/protocol') {
      return `Controls cannot depend on ${specifier}`;
    }
    if (resolved?.startsWith('apps/')) return 'Controls cannot import application code';
  }

  if (projectPath.startsWith('apps/api/')) {
    if (specifier === 'phaser' || specifier === '@rpr/controls' || resolved?.startsWith('apps/web/')) {
      return `API cannot import browser layer ${specifier}`;
    }
  }

  if (projectPath.startsWith('apps/web/src/arcade/')) {
    const registry = projectPath === 'apps/web/src/arcade/registry.ts';
    if (resolved?.startsWith('apps/web/src/games/') && !registry) {
      return 'Shared arcade code cannot import game internals outside the registry';
    }
    if ((specifier === '@rpr/content' || specifier === '@rpr/sim'
      || specifier === '@rpr/rug-pull-rumble-core') && !registry) {
      return `Shared arcade code cannot import game-owned package ${specifier}`;
    }
  }

  const game = gameSegment(projectPath);
  if (game && resolved?.startsWith('apps/web/src/games/')) {
    const target = gameSegment(resolved);
    if (target && target !== game) return `Game ${game} cannot import sibling game ${target}`;
  }
  if (game && resolved?.startsWith('apps/web/src/arcade/')) {
    const allowed = resolved.includes('/arcade/types') || resolved.includes('/arcade/phaser/');
    if (!allowed) return `Game ${game} cannot import shell implementation ${resolved}`;
  }
  return null;
}

function sourceFiles(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return entry.name === 'dist' ? [] : sourceFiles(path);
      return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
    });
  } catch {
    return [];
  }
}

function scanPackageManifests(root: string): ArchitectureViolation[] {
  const manifests = ['apps', 'packages'].flatMap((kind) => {
    const base = resolve(root, kind);
    try {
      return readdirSync(base, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => resolve(base, entry.name, 'package.json'));
    } catch {
      return [];
    }
  });
  return manifests.flatMap((manifest) => {
    const projectPath = normalize(relative(root, manifest));
    const sourcePath = projectPath.replace(/package\.json$/, 'src/index.ts');
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    return Object.keys({
      ...parsed.dependencies,
      ...parsed.optionalDependencies,
    }).flatMap((dependency) => {
      const message = forbiddenImport(sourcePath, dependency, manifest, root);
      return message ? [{ file: projectPath, message: `Forbidden declared dependency: ${message}` }] : [];
    });
  });
}

function packageSegment(path: string): string {
  return path.startsWith('packages/') ? path.split('/')[1] ?? '' : '';
}

function gameSegment(path: string): string | null {
  const match = path.match(/^apps\/web\/src\/games\/([^/]+)/);
  return match?.[1] ?? null;
}

function isPurePackage(path: string): boolean {
  return PURE_PACKAGES.has(packageSegment(path));
}

function isConditional(node: ts.Node): node is ts.IfStatement | ts.SwitchStatement | ts.ConditionalExpression {
  return ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isConditionalExpression(node);
}

function containsRprIdentity(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if ((ts.isStringLiteral(child) && child.text === 'rug-pull-rumble')
      || (ts.isIdentifier(child) && child.text === 'RPR_GAME_ID')) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function allowsRprKnowledge(path: string): boolean {
  return path.startsWith('packages/rug-pull-rumble-core/')
    || path.startsWith('apps/web/src/games/rug-pull-rumble/')
    || path === 'apps/web/src/arcade/registry.ts'
    || path === 'apps/api/src/registry.ts'
    || path === 'apps/api/src/verify/rpr.ts';
}

function unique(values: readonly ArchitectureViolation[]): ArchitectureViolation[] {
  return [...new Map(values.map((value) => [`${value.file}:${value.message}`, value])).values()];
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/');
}
