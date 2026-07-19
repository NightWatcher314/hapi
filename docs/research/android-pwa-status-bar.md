# Android 安装态 PWA 状态栏：规范与浏览器实现

日期：2026-07-19

## 结论

- **不是“PWA 必然只能有黑色状态栏”。** `theme_color` 的用途确实包括影响移动端状态栏；当前 Chromium 源码也存在把网页主题色送入状态栏颜色控制器的路径。
- **也不是网页可跨浏览器可靠控制的能力。** Web App Manifest 只给用户代理偏好；规范明确允许实现者自行解释 display mode，也没有要求 Android 系统状态栏必须使用 `theme_color`。因此 HAPI 在 Chrome Beta/特定 Android 版本上保持黑色，更准确地说是 **Chrome/Chromium WebAPK Activity 与 Android system-bar/edge-to-edge 集成的实现结果（可能随版本、feature flag、目标 SDK 改变）**，不是 HAPI CSS 可以强制修好的标准能力。
- `display: fullscreen` 只请求隐藏浏览器 UI、占用“可用显示区域”。它不是 Android 原生 immersive-mode API，不能保证物理状态栏区域消失。Chromium 当前甚至特意在 fullscreen Web App 中不用页面主题色处理系统栏，以避免临时出现的系统栏透明、不可读。
- **换浏览器可能不同，值得实机 A/B；但不能承诺。** 状态栏属于安装/运行 PWA 的浏览器宿主 Activity。Firefox/Samsung Internet 可有独立行为；Edge/Brave 基于 Chromium，通常更可能接近 Chrome，但版本、下游补丁和安装实现仍可造成差异。
- 若产品要求“所有目标 Android 上可靠同色或可靠隐藏”，需要可控制原生 `Activity` 的 Android 包装（例如 TWA/自有壳）并按 Android edge-to-edge/insets 规则实现；纯 PWA manifest 不提供这个保证。

## 规范到底承诺什么

### `theme_color`

Web App Manifest 把 `theme_color` 定义为 application context 的 **default theme color**。用户代理可以让同 scope 页面中的 `<meta name="theme-color">` 覆盖它，也可以因环境、透明度或配色方案处理而覆盖/忽略部分值。规范没有写“必须把 Android status bar 涂成此颜色”。

Chrome 团队的 PWA 教程表述也很谨慎：`theme_color` 是应用默认色，**sometimes affecting** OS 显示，例如桌面窗口/标题栏或移动设备状态栏。即：这是预期用途，但非跨平台硬保证。

### `display: standalone`

规范：隐藏地址栏等标准浏览器 UI，像独立原生应用；但用户代理 **可以保留 status bar、system back button 等系统 UI**。所以 standalone 顶部仍有 Android 状态栏完全合规。

### `display: fullscreen`

规范：隐藏浏览器 UI，并占满 available display area。display mode 的 UI 约定“purely advisory”，实现者可按平台解释；用户代理也可因安全原因改变实际 display mode。fullscreen manifest mode 还与 Fullscreen API 相互独立。

因此，`fullscreen` 不能等价推导成 Android 的 `WindowInsetsController.hide(systemBars())`，也不能保证刘海/状态栏保留区被网页填充。

## Chromium 当前实现证据

以下为 Chromium `main`，代表当前开发树，不保证用户手机 Chrome Beta 的精确版本已经包含相同逻辑。

1. `WebappActivity` 明确区分 edge-to-edge：启用 `WebAppShortEdgesCutoutMode` 后，只在页面声明 `viewport-fit=cover` 时让 `DisplayCutoutController` 获取 edge-to-edge token；注释说明无条件启用会把 standalone PWA 推到状态栏下面。
2. `CustomTabStatusBarColorProvider` 会在选择网页主题色时返回 `UNDEFINED_STATUS_BAR_COLOR`，交由 Chromium 的 `StatusBarColorController` 使用 tab/page theme；否则使用 browser default 或安装 Intent 中的 manifest toolbar color。说明 Chromium **有意支持**网页/PWA 主题影响状态栏，而非设计上永远黑色。
3. `BrowserServicesThemeColorProvider` 对 `display: fullscreen` 有明确例外：不使用页面 theme color。源码注释称这是为了避免用户滑出系统栏或键盘触发系统栏时，透明栏覆盖网页导致不可见。
4. 同一源码的 display fallback 为 fullscreen → standalone → minimal-ui → browser；浏览器不支持某模式时可降级。

这解释了实测：改为 fullscreen 后图标消失但黑色顶部区域仍在，并不证明“PWA 规范要求黑色”；只证明该 Chrome/Android 组合没有把网页绘制或着色延伸进该系统栏区域。

## Android 15 的变化

Android 官方文档：应用 target SDK 35 且运行在 Android 15+ 时强制 edge-to-edge。窗口应绘制在透明系统栏后，并处理 insets；`Window.setStatusBarColor()` 在 API 35 已弃用，官方要求改为在 `WindowInsets.Type.statusBars()` 后绘制正确背景。真正隐藏 system bars 则使用原生 `WindowInsetsController` immersive-mode API。

这使结果更依赖宿主浏览器 Activity 是否：

- target 新 SDK；
- 启用正确的 edge-to-edge 路径；
- 把 Web 内容延伸到 status-bar inset；
- 正确选择状态栏图标明暗色；
- 对 WebAPK/standalone/fullscreen 启用了哪些 Chromium feature flags。

网页只能提供 manifest/meta/viewport 偏好，无法直接调用这些 Android Window API。

## 换浏览器的实际判断

| 方案 | 是否可能改善 | 预期 |
|---|---:|---|
| Chrome Stable/Beta/Canary 互测 | 是 | Chromium Web App edge-to-edge 代码仍在变化；不同版本/flag 可能不同。最有诊断价值。 |
| Edge / Brave Android | 可能 | Chromium 系，基础 Web App/Activity 行为大概率相近；不能把“换皮”视为可靠修复。仍应实机安装 A/B。 |
| Firefox / Samsung Internet | 可能，差异机会更大 | 独立安装宿主/引擎策略可不同；但规范没有要求它们同色或隐藏，必须实测目标版本。 |
| 原生 Activity / TWA 包装 | 可可靠控制 | Android 层实现 edge-to-edge、insets、system-bar icon appearance；比纯浏览器安装 PWA 可控。TWA 的网页仍由用户浏览器渲染。 |

推荐测试顺序：同一 Android 设备、同一 HAPI URL，先测 Chrome Stable/Canary，再测 Samsung Internet/Firefox；每次删除旧安装后重新安装，记录浏览器版本、Android 版本、安装方式、`matchMedia('(display-mode: ...)')`、截图。不要仅靠普通浏览器标签页主题色判断安装态 Activity。

## HAPI 侧仍应保留的正确配置

- manifest `theme_color` 与默认主界面背景一致；
- 每个动态主题同步 `<meta name="theme-color">`；
- `html`/`body` 根背景一致，避免 edge-to-edge 或 overscroll 暴露另一颜色；
- 若试验 cutout/edge-to-edge，可加 `viewport-fit=cover`，同时用 `env(safe-area-inset-*)` 处理内容安全区；它仍不能保证浏览器会采用该路径；
- 保持 `display: standalone`。当前证据不支持用 fullscreen 作为状态栏修复。

## 一手来源

1. W3C Web App Manifest — `theme_color`, display modes, fallback：<https://www.w3.org/TR/appmanifest/#theme_color-member>、<https://www.w3.org/TR/appmanifest/#display-modes>
2. Chrome/web.dev — Web app manifest；`theme_color` “sometimes affecting” mobile status bar；display mode 行为：<https://web.dev/learn/pwa/web-app-manifest>、<https://web.dev/articles/add-manifest>
3. Chromium `WebappActivity.java` — Web App edge-to-edge / `viewport-fit=cover`：<https://chromium.googlesource.com/chromium/src/+/main/chrome/android/java/src/org/chromium/chrome/browser/webapps/WebappActivity.java>
4. Chromium `CustomTabStatusBarColorProvider.java` — page theme / intent / browser-default status-bar source：<https://chromium.googlesource.com/chromium/src/+/main/chrome/android/java/src/org/chromium/chrome/browser/customtabs/CustomTabStatusBarColorProvider.java>
5. Chromium `BrowserServicesThemeColorProvider.java` — fullscreen 特例：<https://chromium.googlesource.com/chromium/src/+/main/chrome/android/java/src/org/chromium/chrome/browser/customtabs/features/toolbar/BrowserServicesThemeColorProvider.java>
6. Android Developers — Android 15 edge-to-edge、system bars、immersive mode：<https://developer.android.com/develop/ui/views/layout/edge-to-edge>
7. Android `Window.setStatusBarColor` — API 35 deprecated，改为在 status-bar insets 后绘制：<https://developer.android.com/reference/android/view/Window#setStatusBarColor(int)>
8. Chrome Trusted Web Activity overview — 内容由用户浏览器 fullscreen 渲染、宿主为 Android Activity：<https://developer.chrome.com/docs/android/trusted-web-activity/>
