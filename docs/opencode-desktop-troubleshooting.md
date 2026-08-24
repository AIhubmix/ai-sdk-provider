# OpenCode Desktop: `ERR_UNSUPPORTED_DIR_IMPORT` / `Failed to initialize provider: aihubmix`

> 中文版见下方 [中文说明](#中文说明)。

## Symptom

You configured `@aihubmix/ai-sdk-provider` as a custom provider in **OpenCode Desktop** (Electron/Node runtime) and every request fails immediately with:

```
ERR_UNSUPPORTED_DIR_IMPORT
Failed to initialize provider: aihubmix
```

Things that do **not** help: changing the model, re-entering the API key, restarting the app.

The same configuration works fine in the **OpenCode CLI** (Bun runtime).

## This is not an AIHubMix problem

- Your API key is fine.
- AIHubMix network and models are fine.
- The provider package itself is fine — its `package.json` `exports`/`main`/`module` fields all point at valid entry files.

The failure happens **before any network request is made**, at module-load time inside OpenCode Desktop.

## Root cause (OpenCode bug)

Tracked upstream as [anomalyco/opencode#31909](https://github.com/anomalyco/opencode/issues/31909).

OpenCode installs custom npm providers into its cache and then resolves the package entry point in `packages/core/src/npm.ts`:

```ts
entrypoint = typeof Bun !== "undefined"
  ? import.meta.resolve(name, dir)   // Bun (CLI): resolves to dist/index.mjs — correct
  : import.meta.resolve(dir)         // Node (Desktop): returns the *directory* URL
```

On the Node path the resolved "entry point" is just the package **directory** converted to a `file://` URL. OpenCode then calls `await import(<directory URL>)`, and Node's ESM loader refuses to import directories — hence `ERR_UNSUPPORTED_DIR_IMPORT`. Nothing a provider package can put in its `package.json` changes this, and OpenCode installs with `ignoreScripts: true`, so a package cannot patch around it either.

Providers like OpenRouter and the official `@ai-sdk/*` packages are unaffected only because they are statically **bundled into the Desktop app** (`BUNDLED_PROVIDERS` in `packages/opencode/src/provider/provider.ts`) and never go through this code path. Every non-bundled third-party npm provider hits this bug on Desktop.

## Workaround: point `npm` at the entry file via `file://`

OpenCode passes `npm` values that start with `file://` straight to `import()`, skipping the broken resolver. So point it directly at the provider's real entry file.

### Option A (recommended): standalone install

Install the provider once into a stable location:

```bash
mkdir -p ~/.aihubmix-provider && cd ~/.aihubmix-provider && npm init -y >/dev/null && npm i @aihubmix/ai-sdk-provider
```

Then in your `opencode.json`:

```jsonc
{
  "provider": {
    "aihubmix": {
      "npm": "file:///Users/<you>/.aihubmix-provider/node_modules/@aihubmix/ai-sdk-provider/dist/index.mjs",
      // ...rest of your existing aihubmix config (name, options, models) unchanged
    }
  }
}
```

Use an absolute path (`~` is not expanded inside `file://` URLs). On Windows the URL looks like `file:///C:/Users/<you>/.aihubmix-provider/node_modules/@aihubmix/ai-sdk-provider/dist/index.mjs`.

To update the provider later: `cd ~/.aihubmix-provider && npm update @aihubmix/ai-sdk-provider`.

### Option B: reuse OpenCode's own cache

If OpenCode has already (unsuccessfully) initialized the provider once, the package is installed in its cache. Point `npm` at the entry file inside it:

```
file://<opencode-cache>/packages/@aihubmix/ai-sdk-provider/node_modules/@aihubmix/ai-sdk-provider/dist/index.mjs
```

where `<opencode-cache>` is typically `~/.cache/opencode` (Linux/macOS). Note this breaks if OpenCode clears its cache; Option A is more durable.

### Do not hand-patch the cache

Renaming the cached package directory and dropping in a shim file also works, but OpenCode reinstalls/clears the cache and your patch silently disappears. Prefer the `file://` config above.

## Status of the real fix

- Upstream issue: [#31909](https://github.com/anomalyco/opencode/issues/31909) (open).
- A community fix ([PR #32060](https://github.com/anomalyco/opencode/pull/32060)) implemented the correct resolver but was auto-closed by the stale-PR bot without review.
- Once OpenCode fixes the resolver (or bundles this provider), the workaround is no longer needed — you can switch `npm` back to `"@aihubmix/ai-sdk-provider"`.

Meanwhile, the **OpenCode CLI** works with the normal configuration and needs no workaround.

---

# 中文说明

## 症状

在 **OpenCode Desktop**（Electron/Node 运行时）里把 `@aihubmix/ai-sdk-provider` 配置为自定义 provider 后，所有请求立刻失败：

```
ERR_UNSUPPORTED_DIR_IMPORT
Failed to initialize provider: aihubmix
```

换模型、重新填写 API Key、重启应用均无效；同样的配置在 **OpenCode CLI**（Bun 运行时）下一切正常。

## 这不是 AIHubMix 的问题

- 你的 API Key 没问题；
- AIHubMix 的网络和模型没问题；
- 本 provider 包本身也没问题（`exports` / `main` / `module` 均指向有效入口文件）。

错误发生在**发出任何网络请求之前**的模块加载阶段，根因在 OpenCode Desktop 自身。

## 根因（OpenCode 的 bug）

上游 issue：[anomalyco/opencode#31909](https://github.com/anomalyco/opencode/issues/31909)。

OpenCode 把自定义 npm provider 装进自己的缓存目录后，在 `packages/core/src/npm.ts` 里解析入口：Bun 路径（CLI）能正确解析出 `dist/index.mjs`；Node 路径（Desktop）却只把**包目录**转成 `file://` URL，随后直接 `import(目录URL)` —— 而 Node 的 ESM 加载器禁止导入目录，于是必然抛 `ERR_UNSUPPORTED_DIR_IMPORT`。包内 `package.json` 写什么都影响不到这一步，且 OpenCode 安装时设了 `ignoreScripts: true`，包也无法用安装脚本自救。

OpenRouter 及官方 `@ai-sdk/*` 系列之所以没事，只是因为它们被**静态打包进了 Desktop 应用**（`BUNDLED_PROVIDERS` 白名单），根本不走这条出错的加载链路。所有不在白名单里的第三方 npm provider 在 Desktop 上都会踩中此 bug。

## 临时解决方案：用 `file://` 直指入口文件

OpenCode 对以 `file://` 开头的 `npm` 字段会直通 `import()`，跳过坏掉的解析器。

**方案 A（推荐）：独立安装一份**

```bash
mkdir -p ~/.aihubmix-provider && cd ~/.aihubmix-provider && npm init -y >/dev/null && npm i @aihubmix/ai-sdk-provider
```

然后在 `opencode.json` 里：

```jsonc
{
  "provider": {
    "aihubmix": {
      "npm": "file:///Users/<你>/.aihubmix-provider/node_modules/@aihubmix/ai-sdk-provider/dist/index.mjs"
      // 其余 aihubmix 配置（name、options、models）保持不变
    }
  }
}
```

注意要写绝对路径（`file://` URL 里不会展开 `~`）。后续升级：`cd ~/.aihubmix-provider && npm update @aihubmix/ai-sdk-provider`。

**方案 B：复用 OpenCode 自己的缓存**

provider 首次（失败的）初始化后包已装在 OpenCode 缓存里，可直接指向其中的入口文件（`<缓存目录>` 通常是 `~/.cache/opencode`）：

```
file://<缓存目录>/packages/@aihubmix/ai-sdk-provider/node_modules/@aihubmix/ai-sdk-provider/dist/index.mjs
```

缺点：OpenCode 清缓存后失效，不如方案 A 稳。

**不建议手改缓存**：重命名缓存里的包目录再放转发文件也能通，但 OpenCode 清缓存/重装后补丁会悄悄消失。

## 官方修复进展

- 上游 issue [#31909](https://github.com/anomalyco/opencode/issues/31909) 仍为 Open；
- 社区修复 [PR #32060](https://github.com/anomalyco/opencode/pull/32060) 方案正确，但被 stale 机器人自动关闭、未被审阅；
- 待 OpenCode 修好解析器（或将本包收入内置白名单）后，把 `npm` 字段改回 `"@aihubmix/ai-sdk-provider"` 即可。

在此之前，**OpenCode CLI** 用常规配置即可正常工作，无需任何 workaround。
