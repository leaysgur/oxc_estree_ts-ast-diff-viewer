import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { glob } from "tinyglobby";
import { visitorKeys } from "@typescript-eslint/visitor-keys";
import { parseSync } from "../../oxc/napi/parser/index.js";

// Check the order of keys in the AST nodes between our parser and theirs.
//
// This scripts depends on that our AST has the same key order across all nodes which has the same type.
// Run `./verify-key-order-oxc.js` first to ensure this.
//
// NOTE: Use `bun` to run this script to avoid maximum call stack size exceeded error with Node.js...

const orderMismatches = new Map();

for (const cwd of [
  resolve("../oxc/tasks/coverage/typescript/tests/cases/compiler"),
  resolve("../oxc/tasks/coverage/typescript/tests/cases/conformance"),
]) {
  const files = await glob(["**/*.ts", "**/*.tsx"], { cwd, absolute: true });
  for (const absPath of files) {
    const sourceText = await readFile(absPath, "utf-8");

    let program;
    try {
      program = parseOurs(absPath, sourceText);
    } catch (err) {
      // console.error(err.message);
      continue;
    }

    visitNode(program, (node) => {
      const theirKeys = visitorKeys[node.type] ?? [];
      // Filter out our keys which contain `type`, `start|end`, and other premitive values like `computed`
      const ourKeys = Object.keys(node).filter((key) => theirKeys.includes(key));

      if (ourKeys.toString() !== theirKeys.toString()) {
        orderMismatches.set(node.type, {
          theirs: theirKeys,
          ours: ourKeys,
        });
      }
    });
  }
}

const sortedOrderMismatches = new Map(
  [...orderMismatches.entries()]
    .filter(([type, { theirs, ours }]) => {
      if (type === "TSModuleDeclaration" && ours.length === 1 && ours[0] === "id") return false;
      return true;
    })
    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey)),
);
console.log(sortedOrderMismatches);

// ---

function parseOurs(filename, code, experimentalRawTransfer = false) {
  const ret = parseSync(filename, code, {
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

function visitNode(node, fn) {
  if (!node) return;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      visitNode(node[i], fn);
    }
    return;
  }
  for (const key of visitorKeys[node.type] ?? []) {
    visitNode(node[key], fn);
  }
  fn(node);
}
