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

3. Install deps and create indexes

```sh
cd oxc_estree_ts-ast-diff-viewer

npm i

# create or update indexes in `./generated`
# This may take about 20~30 sec...
node ./create-index.js
```

4. Run viewer

```sh
# Run app
npm run dev
```

5. Open http://localhost:5173

