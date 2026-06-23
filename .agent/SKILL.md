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

---

## 4. 千分位格式化的非侵入式设计 (Focus/Blur Dual State)

### 痛点
当开启千分位格式化后，输入框中的数字字符串会被加入逗号（例如 `1,234,567.89`）。如果在用户输入过程中实时更新千分位，会面临以下复杂边界问题：
1. 光标定位（`selectionStart`/`selectionEnd`）会因为字符数量的变动而发生非预期偏移。
2. 键盘事件拦截（如限制小数点、负号只能有一个）在处理包含逗号的字符串时，会大幅增加计算难度。

### 解决方案
利用**聚焦（Focus）与失焦（Blur）双重状态**来分离编辑与展示：
1. **编辑状态（Focus）**：在 `focus` 事件处理器中，若开启了 `thousands: true`，则将输入框值中的逗号 `,` 全部移除（还原为纯数字）。这使得用户在编辑时面对的是纯净数字，原有的 `keypress` 拦截机制（如负号位置、小数点数量、精度控制等）无需做任何额外适配即可完美工作。
2. **展示状态（Blur）**：在 `blur` 事件处理器中进行最终的数值边界限制和精度处理，最后通过 `parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')` 对整数部分正则格式化为千分位形式。
3. **粘贴（Paste）**：因为粘贴动作是在聚焦状态下触发的，所以 `paste` 的拦截处理器只对数字进行基础规范清洗而不转千分位，确保编辑体验的一致性。
4. **初始化与外部数据流更新（Init & Updated）**：
   - **挂载时（`mounted`）**：在指令挂载时，如果输入框有初始值（不论是数字、纯数字字符串，还是带千分位的字符串），若当前处于未聚焦状态，则在初始化时进行一次格式化，确保首屏渲染出美观的千分位。
   - **动态更新时（`updated`）**：如果后端在异步请求完成后更改了绑定的数据（导致 `updated` 被触发），如果输入框没有被聚焦，则会重新清洗该数值并再次转化为规范的千分位字符串。通过判断 `curValue !== sanitized`，成功阻断了因为 `setVal` 重新派发事件引发的 Vue 重新渲染死循环。

---

## 5. 千分位格式化下 v-model 绑定值的纯数字设计 (Clean V-Model Value with Thousands)

### 痛点
当开启千分位格式化后，输入框内容变为 `1,234.56`。如果将带逗号的字符串直接同步回 `v-model` 绑定的变量，可能会产生以下弊端：
1. 业务逻辑在处理该值（如提交到后端、进行数学运算等）时需要手动清洗逗号。
2. 常见的数字转换（如 `Number('1,234.56')` 或 `+value`）会解析出 `NaN`，从而引发前端逻辑报错。

### 解决方案
在 `setVal` 方法中分离 **DOM 呈现值** 与 **Vue 双向绑定值** 的传递：
1. **生成纯净值**：通过 `const emitValue = binding.thousands ? value.replace(/,/g, '') : value` 生成去除了所有逗号的纯数字字符串作为传递值。
2. **更新组件状态**：对于 Vue 组件，通过 `vnode.component.emit('update:modelValue', emitValue)` 直接派发纯数字值。
3. **触发 input 事件**：对于原生 input 或者兼容原生机制的组件，在触发 `input` 事件前临时将 `input.value` 切换为 `emitValue`，触发事件完毕后再恢复为带有千分位的展示值。这确保了事件气泡向上传递时携带的是纯净的数值：
   ```typescript
   if (binding.thousands) {
     const originalValue = target.value
     target.value = emitValue
     target.dispatchEvent(new Event('input', { bubbles: true }))
     target.value = originalValue
   } else {
     target.dispatchEvent(new Event('input', { bubbles: true }))
   }
   ```
这套设计完美实现了“所见即所想”——**用户在界面上看到的是易读的千分位金融格式，而开发者在代码中拿到的始终是干净可直接计算的纯数字字符串**。

