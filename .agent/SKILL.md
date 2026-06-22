# 项目技能与设计沉淀 (SKILL.md)

本文件记录了 `v-only-number` 的核心设计模式和架构沉淀，用以指导后续维护。

## 1. 使用 WeakMap 代替直接修改 DOM Element

### 痛点
在 Vue 自定义指令中，我们需要在 `mounted`、`updated`、`unmounted` 钩子之间共享配置项（`binding.value`）和事件监听器（以便在 `unmounted` 时解绑）。直接将这些数据挂载在 DOM Element 上（如 `el._onlyNumBinding`）具有以下弊端：
1. 侵入式修改：可能与其他第三方库或指令产生命名冲突。
2. 破坏 TypeScript 的类型定义，使得必须通过大量的类型转换（如 `(el as any)`）。
3. 如果未妥善清理，容易发生垃圾回收失败而引发内存泄露。

### 解决方案
利用 ES6 的 `WeakMap`：
```typescript
const bindingMap = new WeakMap<Element, OnlyNumberOptions>()
const listenersMap = new WeakMap<Element, OnlyNumberListeners>()
```
* **工作原理**：`WeakMap` 允许我们将 `Element` 对象作为键，关联配置和事件回调。
* **内存安全**：`WeakMap` 的键是弱引用的。一旦对应的 DOM 节点在页面中被移除并销毁，垃圾回收器会自动清理 `WeakMap` 中对应的键值对，无需担心内存泄漏。

---

## 2. 依赖解耦与安全降级设计 (Element Plus Decoupling)

### 痛点
原代码强依赖了 `import { ElMessage } from 'element-plus'`。如果作为独立 NPM 模块发布，用户如果在非 Element Plus 项目（如 Ant Design 或 Naive UI 项目）中引用此包，会因为缺失依赖报错崩溃。

### 解决方案
采用**依赖注入 + 安全回退**的设计：
1. **指令配置 & 全局注入**：允许用户在全局安装或者单条指令使用时，传入自定义的提示句柄 `messageHandler`。
2. **安全回退逻辑**：如果用户未配置消息提示句柄，在运行时动态获取全局的 `ElMessage`：
   ```typescript
   try {
     const anyGlobal = globalThis as any
     const ElMessage = anyGlobal.ElMessage || anyGlobal.ElementPlus?.ElMessage
     if (ElMessage && typeof ElMessage.info === 'function') {
       ElMessage.info(msg)
       return
     }
   } catch (e) {}
   ```
3. **最终降级**：若全局没有 `ElMessage`，则使用 `console.warn` 打印警告，从而保证在任何 UI 框架中此包都能平稳运行。

---

## 3. 条件导出配置 (Conditional Exports)

在 `package.json` 中配置：
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.mjs",
    "require": "./dist/index.js"
  }
}
```
这保证了包能够完美兼容打包工具的 ESM（Vite、Webpack 5）与传统的 Node.js CJS，同时也能在 TS 开发中提供即时的类型提示。
