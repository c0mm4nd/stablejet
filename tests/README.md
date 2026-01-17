# StableJet Playwright 测试

## 测试概述

这个测试套件使用 Playwright 验证 StableJet 应用的所有数据源可用性和可视化功能。

## 测试内容

### 数据源验证
- ✅ 19个区块链网络（Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Avalanche, HyperEVM, Monad, Sonic, Etherlink, Mantle, UniChain, Berachain, Fantom, Gnosis, zkSync Era, Linea, Scroll）
- ✅ 3种数据源（KyberSwap, Nordstern, Binance）
- ✅ 4个金额档位（$5,000, $10,000, $30,000, $50,000）

### 可视化验证
- ✅ 价差线图
- ✅ 跨链套利机会图
- ✅ 时间窗口选择器
- ✅ 实时数据更新
- ✅ 配置设置界面

### 性能验证
- ✅ 页面加载时间
- ✅ API响应时间
- ✅ 错误处理

## 运行测试

### 1. 安装依赖（首次运行）
```bash
npm install
```

### 2. 运行所有测试
```bash
npm test
```

### 3. 以可视化模式运行
```bash
npm run test:ui
```

### 4. 以有头模式运行（查看浏览器）
```bash
npm run test:headed
```

### 5. 查看测试报告
```bash
npm run test:report
```

## 测试文件

- `data-sources-visualization.spec.ts` - 主测试套件（16个测试用例）
- `test-summary.md` - 测试结果摘要报告
- `screenshots/` - 自动截图目录

## 测试结果

最新测试结果：**16/16 通过** ✅

详细报告请查看 `test-summary.md`

## 注意事项

1. **首次运行**：应用启动后需要等待数据收集，图表会显示"暂无历史数据"（正常现象）
2. **开发服务器**：测试会自动启动 `npm run dev`，不需要手动启动
3. **端口占用**：确保 3000 端口可用
4. **浏览器**：自动安装 Chromium 浏览器

## 故障排除

### 测试失败
```bash
# 查看详细错误信息
npm test -- --reporter=list

# 查看失败截图
open test-results/
```

### 端口被占用
```bash
# 查找占用 3000 端口的进程
lsof -ti:3000

# 杀掉进程
kill -9 <PID>
```

### 清理测试数据
```bash
# 删除测试结果
rm -rf test-results/

# 删除截图
rm -rf tests/screenshots/*.png

# 删除 Playwright 报告
rm -rf playwright-report/
```

## 持续集成

测试可以在 CI/CD 环境中运行：

```yaml
# GitHub Actions 示例
- name: Install dependencies
  run: npm ci
  
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium
  
- name: Run tests
  run: npm test
  
- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## 更多信息

- [Playwright 文档](https://playwright.dev)
- [项目主 README](../README.md)
