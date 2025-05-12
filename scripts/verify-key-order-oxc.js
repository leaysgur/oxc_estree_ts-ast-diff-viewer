import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { glob } from "tinyglobby";
import { visitorKeys } from "@typescript-eslint/visitor-keys";
import { parseSync } from "../../oxc/napi/parser/index.js";
import { parse } from "@typescript-eslint/parser";

const keysCache = new Map();

for (const cwd of [
  resolve("../oxc/tasks/coverage/typescript/tests/cases/compiler"),
  resolve("../oxc/tasks/coverage/typescript/tests/cases/conformance"),
]) {
  const files = await glob(["**/*.ts", "**/*.tsx"], { cwd, absolute: true });
  for (const absPath of files) {
    const sourceText = await readFile(absPath, "utf-8");

    let program;
    try {
      program = parseOurs(sourceText);
      // NOTE: Unfortunately, they also have many non-aligned keys!
      // program = parseTheirs(sourceText);
    } catch (err) {
      // console.error(err.message);
      continue;
    }

    visitNode(program, (node) => {
      const keys = Object.keys(node).toString();
      const prevKeys = keysCache.get(node.type);

      // No keys yet, just add it and continue to next
      if (!prevKeys) {
        keysCache.set(node.type, [keys]);
        return node;
      }

      // If the keys are the same, just continue to next
      if (prevKeys.includes(keys)) return node;

      // If the keys are different, report it to fix!
      keysCache.set(node.type, [...prevKeys, keys]);

      return node;
    });
  }
}

const differentKeyOrderForSameNode = new Map(
  keysCache.entries().filter(([_, keys]) => 1 !== keys.length),
);
if (0 === differentKeyOrderForSameNode.size) {
  console.log("✨", "All keys have the same order across all nodes!");
} else {
  console.log("💥", "These keys have different order across all nodes");
  console.log(differentKeyOrderForSameNode);
}

// ---

function parseOurs(code, experimentalRawTransfer = false) {
  const ret = parseSync("foo.ts", code, {
    preserveParens: false,
    // `errorOnTypeScriptSyntacticAndSemanticIssues` is `false` for theirs
    // https://github.com/peanutenthusiast/typescript-eslint/blob/bca8a914b23d1c2ee07d8416f0f3b9991de85438/packages/parser/src/parser.ts#L124-L126
    showSemanticErrors: false,
    experimentalRawTransfer,
  });

  if (ret.errors.length !== 0) throw new Error("OXC failed to parse");

  // TODO: For theirs, this is comment w/ `type: Shebang`
  delete ret.program.hashbang;

  return ret.program;
}

function parseTheirs(code) {
  const ast = parse(code, {
    sourceType: "module",
    tokens: false,
    range: false,
    comments: false,
  });
  delete ast.tokens;
  delete ast.comments;

  return ast;
}

function visitNode(node, fn) {
  if (!node) return node;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = visitNode(node[i], fn);
    }
    return node;
  }
  for (const key of visitorKeys[node.type] ?? []) {
    node[key] = visitNode(node[key], fn);
  }
  return fn(node) ?? node;
}
