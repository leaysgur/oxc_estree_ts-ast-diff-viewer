# oxc_estree_ts-ast-diff-viewer

> Align JS-side AST with standard for TypeScript · Issue #9705 · oxc-project/oxc
> https://github.com/oxc-project/oxc/issues/9705

Simple app for browsing AST differences between TS-ESLint and OXC.

![](./ss.avif)

## How to use

1. Clone OXC repo next to this repo

```
- oxc
  - tasks
    - coverage
      - typescript
  - ...
- oxc_estree_ts-ast-diff-viewer
  - README.md
  - ...
```

2. Prepare typescript fixtures and prebuild `oxc-parser`

```sh
cd oxc
just submodules

cd napi/parser
pnpm run build
```

3. Install Bun js runtime for setup script and also viewer dependencies
4. Create index files and run viewer

```sh
cd oxc_estree_ts-ast-diff-viewer

# Install deps(You can use `npm` instead if you want)
bun i

# create or update index in `./generated`
# This may take about 20~30 sec...
bun ./bun-create-index.js

# Run app(You can use `npm` instead if you want)
bun run dev
```

5. Open http://localhost:5173

