export const ssr = false;

import { readFile } from "node:fs/promises";

/** @typedef {{ id: string, added: number, removed: number }} Index */

/** @type {import('./$types').PageServerLoad<{
 *	compilerIndex: Index[],
 *	conformanceIndex: Index[]
 * }>} */
export async function load() {
  const [compilerIndex, conformanceIndex] = await Promise.all(
    ["compiler", "conformance"].map((category) =>
      readFile([import.meta.dirname, "../../generated", category, "index.txt"].join("/"), "utf-8")
        .catch(() => "")
        .then((data) => (data === "" ? [] : data.split("\n")))
        .then((list) =>
          list.map((line) => {
            const [id, added, removed] = line.split("|");
            return { id, added: Number(added), removed: Number(removed) };
          }),
        ),
    ),
  );

  console.log("compilerIndex", compilerIndex.length);
  console.log("conformanceIndex", conformanceIndex.length);

  return {
    compilerIndex,
    conformanceIndex,
  };
}
