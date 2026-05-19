# 短视频内容生产模块
## 功能
为酸辣粉抖音店铺自动生成短视频全案内容，支持本地无GPT fallback生成

## 目录结构
- video-rules.js：内容规则常量配置
- title-generator.js：标题生成器
- hook-generator.js：开头3秒生成器
- video-script-generator.js：核心脚本生成器
- __tests__/：测试用例

## 入口
核心调用：video-script-generator.generateVideoAdvice(input)

## 约束
仅新增文件，不修改任何原有模块
