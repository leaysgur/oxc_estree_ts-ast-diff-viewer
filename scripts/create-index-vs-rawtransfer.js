import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { diffLines } from "diff";
import sortObject from "sort-keys";
import { parseSync } from "../../oxc/napi/parser/index.js";
import { glob } from "tinyglobby";

const IGNORE_LIST = [
  // JSDocXxxType: https://github.com/typescript-eslint/typescript-eslint/issues/11064
  "compiler/expressionWithJSDocTypeArguments.ts",
  "compiler/parseInvalidNonNullableTypes.ts",
  "compiler/parseInvalidNullableTypes.ts",
  "conformance/types/tuple/restTupleElements1.ts",
  "conformance/types/tuple/named/namedTupleMembersErrors.ts",
  // Maximum call stack size exceeded for Node.js by default
  "compiler/binderBinaryExpressionStress.ts",
  "compiler/binderBinaryExpressionStressJs.ts",
  // OXC crashes when encountering `export import`
  "compiler/es6ImportDefaultBindingFollowedWithNamedImport1WithExport.ts",
  "compiler/es6ImportDefaultBindingFollowedWithNamedImportWithExport.ts",
  "compiler/es6ImportDefaultBindingFollowedWithNamespaceBinding1WithExport.ts",
  "compiler/es6ImportDefaultBindingFollowedWithNamespaceBindingWithExport.ts",
  "compiler/es6ImportDefaultBindingWithExport.ts",
  "compiler/es6ImportNameSpaceImportWithExport.ts",
  "compiler/es6ImportNamedImportWithExport.ts",
  "compiler/es6ImportWithoutFromClauseWithExport.ts",
];

if (process.versions.bun) {
  console.error("This script must be run with Node.js to enable `rawTransfer`!");
  process.exit(1);
}

const stats = {};

for (const cwd of [
  resolve("../oxc/tasks/coverage/typescript/tests/cases/compiler"),
  resolve("../oxc/tasks/coverage/typescript/tests/cases/conformance"),
]) {
  const category = cwd.split("/").pop();

  await rm(join("./generated", category), { recursive: true, force: true });
  await mkdir(join("./generated", category), { recursive: true });

  const time = performance.now();
  const counter = {
    ignored: 0,
    theirsFailed: 0,
    oursFailed: 0,
    matched: 0,
    missmatched: 0,
  };
  const index = [];

  const files = await glob(["**/*.ts", "**/*.tsx"], { cwd, absolute: true });
  for (const absPath of files) {
    if (IGNORE_LIST.some((p) => absPath.includes(p))) {
      counter.ignored++;
      continue;
    }

    const path = absPath.split(cwd).pop().slice(1).replace(/\//g, ".");
    const id = [category, path].join("/");

    console.log("Parsing", id);
    const sourceText = await readFile(absPath, "utf-8");

    const results = { theirs: null, ours: null };

    let theirsFailed = false;
    try {
      results.theirs = ensureTrailingComma(parseOurs(absPath, sourceText, true));
    } catch {
      // NOTE: Some files are syntactically invalid TS, so they cannot parse.
      // We can safely skip them too.
      theirsFailed = true;
    }

    let oursFailed = false;
    try {
      results.ours = ensureTrailingComma(parseOurs(absPath, sourceText, false));
    } catch {
      // NOTE: Unfortunately, they can parse some files which are invalid for us.
      oursFailed = true;
    }

    if (theirsFailed && oursFailed) {
      // Both parsers failed, so we can skip this file.
      counter.matched++;
      continue;
    }

    if (theirsFailed) {
      // Theirs parser failed, but ours succeeded.
      counter.theirsFailed++;
      console.warn("Theirs parser failed for", id);
      continue;
    }
    if (oursFailed) {
      // Ours parser failed, but theirs succeeded.
      counter.oursFailed++;
      console.warn("Ours parser failed for", id);
      continue;
    }

    // Now we have 2 parsed AST strings, we need to diff them.

    // Match!
    if (results.ours === results.theirs) {
      counter.matched++;
      continue;
    }

    console.log("Diffing", id);
    console.time();

    // `diff` also exports `diffJson()` and it supports ordering and prettifying.
    // But we don't use it since:
    // - It is too slow
    // - It is not possible to save formatted JSON
    const changes = diffLines(results.ours, results.theirs);

    const diff = [0, 0];
    for (const change of changes) {
      if (change.added) diff[0] += change.count ?? 0;
      if (change.removed) diff[1] += change.count ?? 0;
    }

    index.push([id, diff[0], diff[1]].join("|"));

    const dest = join("./generated", id);
    await mkdir(dest, { recursive: true });
    await Promise.all([
      writeFile(`${dest}/source.ts`, sourceText),
      writeFile(`${dest}/ours.json`, results.ours),
      writeFile(`${dest}/theirs.json`, results.theirs),
      writeFile(`${dest}/diff.json`, JSON.stringify(changes)),
    ]);

    counter.missmatched++;
    console.timeEnd();
  }

  index.sort((a, b) => a.localeCompare(b));
  await writeFile(`./generated/${category}/index.txt`, index.join("\n"));

  stats[category] = {
    ...counter,
    time: ((performance.now() - time) / 1000).toFixed(2) + " sec",
  };
}

console.log("✅", `files created in ./generated/(${Object.keys(stats).join("|")})/`);
console.table(stats);

// ---

const INFINITY_PLACEHOLDER = "__INFINITY__INFINITY__INFINITY__";
const BIGINT_PLACEHOLDER = "__BIGINT__";

function parseOurs(filename, code, experimentalRawTransfer = false) {
  const ret = parseSync(filename, code, {
    preserveParens: false,
    // `errorOnTypeScriptSyntacticAndSemanticIssues` is `false` for theirs
    // https://github.com/peanutenthusiast/typescript-eslint/blob/bca8a914b23d1c2ee07d8416f0f3b9991de85438/packages/parser/src/parser.ts#L124-L126
    showSemanticErrors: false,
    experimentalRawTransfer,
  });

  if (ret.errors.length !== 0) throw new Error("OXC failed to parse");

  return JSON.stringify(ret.program, transformerOxc, 2);

  // Transformer for Oxc AST.
  function transformerOxc(_key, value) {
    if (typeof value === "bigint") return `${BIGINT_PLACEHOLDER}${value}${BIGINT_PLACEHOLDER}`;
    if (value === Infinity) return INFINITY_PLACEHOLDER;

    if (typeof value !== "object" || value === null || !Object.hasOwn(value, "type")) return value;

    if (value.type === "Literal" && Object.hasOwn(value, "regex")) {
      value.regex.flags = [...value.regex.flags].sort().join("");
      value.value = null;
    }

    const deep = ["Literal", "TemplateElement"].includes(value.type);
    return sortObject(value, { deep });
  }
}

// Naive, but very much faster than `json5.stringify()` and enough for us
function ensureTrailingComma(json) {
  return json
    .split("\n")
    .map((line) =>
      line.endsWith(",") || line.endsWith("{") || line.endsWith("[") ? line : line + ",",
    )
    .join("\n");
}
