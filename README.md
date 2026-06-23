# @leslie1900/only-number

一个轻量、高效的 Vue 3 指令库，用于限制输入框只能输入数字，并提供丰富的自定义规则（如最大值/最小值限制、精度控制、正数限制及自定义错误消息提示等）。

## 特性

* 🚀 **轻量高效**：零依赖，打包体积极小。
* 🧩 **无缝兼容**：完美支持原生 `input` 以及 Element Plus 的 `el-input` 等组件。
* 🔒 **防污染设计**：内部采用 `WeakMap` 管理元素状态，防止全局类型污染与内存泄露。
* 🎨 **灵活的提示机制**：支持自定义消息处理句柄，可安全兼容 Element Plus 消息提示或自定义弹窗。
* 🛠️ **精细拦截**：从键盘事件 (`keypress`)、粘贴事件 (`paste`) 到失焦格式化 (`blur`)，全方位拦截并修正非法字符。

---

## 安装

使用 npm、yarn 或 pnpm 安装：

```bash
npm install @leslie1900/only-number
# 或者
yarn add @leslie1900/only-number
# 或者
pnpm add @leslie1900/only-number
```

---

## 注册与引入

### 1. 全局注册

在项目入口文件（例如 `main.ts` 或 `main.js`）中注册：

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import { setupOnlyNumberDirective } from '@leslie1900/only-number'
import { ElMessage } from 'element-plus'

const app = createApp(App)

// 注册 v-only-number 指令，并传入全局消息提示回调（可选）
setupOnlyNumberDirective(app, {
  messageHandler: (msg) => {
    ElMessage.info(msg)
  }
})

app.mount('#app')
```

### 2. 局部注册

在单个 Vue 组件中局部引入：

```html
<script setup>
import { onlyNumberDirective as vOnlyNumber } from '@leslie1900/only-number'
</script>

<template>
  <input v-only-number />
</template>
```

---

## 配置参数

你可以通过给指令传一个对象来精细控制限制逻辑：

```html
<input v-only-number="options" />
```

`options` 支持的属性如下：

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `max` | `number` | `Infinity` | 允许输入的最大值，超出后在失焦（blur）时会自动修正为最大值。 |
| `min` | `number` | `-Infinity` | 允许输入的最小值，低于后在失焦（blur）时会自动修正为最小值。 |
| `precision` | `number` | `-` | 限制保留的小数位数。若不设置此项，则保留用户输入的原始精度。 |
| `integer` | `boolean` | `false` | 是否只允许输入整数（等同于设置 `precision: 0` 且禁止输入小数点 `.`）。 |
| `isPositiveNumber` | `boolean` | `false` | 是否只允许正数（大于 0）。若为 `true` 或 `min >= 0`，将禁止输入负号 `-`。 |
| `maxText` | `string` | `-` | 超出最大值限制时的提示文本，将传给 `messageHandler` 进行展示。 |
| `minText` | `string` | `-` | 低于最小值限制时的提示文本，将传给 `messageHandler` 进行展示。 |
| `messageHandler` | `(msg: string) => void` | `-` | 指令级别的消息提示句柄，若不传，则回退到全局 `messageHandler`，或尝试使用 Element Plus，或降级到 `console.warn`。 |
| `thousands` | `boolean` | `false` | 是否开启千分位格式化。开启后，失焦（blur）时内容格式化为千分位形式（如 `1,234,567.89`），聚焦（focus）时剥离逗号方便编辑。*注意：v-model 绑定的值在失焦时也会同步为带逗号的字符串。* |

---

## 示例

### 1. 限制只允许输入整数
```html
<template>
  <!-- 方式一：直接配置 integer 为 true -->
  <el-input v-only-number="{ integer: true }" v-model="value" />
  
  <!-- 方式二：设置 precision 为 0 -->
  <el-input v-only-number="{ precision: 0 }" v-model="value" />
</template>
```

### 2. 限制保留 2 位小数，并限制最大最小值
```html
<template>
  <el-input 
    v-only-number="{ 
      precision: 2, 
      min: 0, 
      max: 100, 
      minText: '分数不能低于0', 
      maxText: '分数不能超过100' 
    }" 
    v-model="score" 
  />
</template>
```

### 3. 限制只能输入正数（大于 0）
```html
<template>
  <el-input v-only-number="{ isPositiveNumber: true }" v-model="amount" />
</template>
```

### 4. 局部定义错误消息提示
```html
<script setup>
import { onlyNumberDirective as vOnlyNumber } from '@leslie1900/only-number'
import { message } from 'ant-design-vue'

const amountOptions = {
  max: 9999,
  maxText: '金额已超限',
  messageHandler: (msg) => {
    message.warning(msg)
  }
}
</script>

<template>
  <input v-only-number="amountOptions" v-model="amount" />
</template>
```

### 5. 开启金额千分位格式化
```html
<template>
  <!-- 聚焦时为纯数字方便编辑，失焦时自动转化为如 1,234,567.89 的千分位格式 -->
  <el-input 
    v-only-number="{ 
      thousands: true, 
      precision: 2 
    }" 
    v-model="amount" 
  />
</template>
```

---

## 许可证

[MIT](LICENSE)
