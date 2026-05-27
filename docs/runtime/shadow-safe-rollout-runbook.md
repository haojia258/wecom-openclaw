# Shadow Safe Rollout Runbook

> **版本**: v1.0  
> **日期**: 2026-05-28  
> **作者**: HaoZhongLiang  
> **状态**: DRAFT → READY

---

## 1. 事故复盘（P9.3.3 Rollout 中断事件）

### 事件摘要

| 字段 | 内容 |
|---|---|
| **时间** | 2026-05-27 T18:00 — T18:17 GMT+8 |
| **影响** | wecom-adapter 累计 3387 次重启，PM2 status=errored |
| **用户感知** | 3001 偶发超时（zombie 进程响应不稳定） |
| **MTTR** | ~17min（发现 → kill zombie → 恢复正常） |

### 根本原因（5-Why）

| # | 问题 | 回答 |
|---|---|---|
| 1 | 为什么 wecom-adapter 反复崩溃？ | PM2 报告 EADDRINUSE（3001 被占用） |
| 2 | 为什么 3001 被占用？ | root 用户下的独立 PM2 实例正在运行 wecom-adapter |
| 3 | root PM2 的 wecom-adapter 从哪来？ | 历史误操作：曾用 `sudo pm2 start` 启动过 wecom-adapter |
| 4 | 为什么 ubuntu PM2 没有报错预警？ | PM2 只在 `pm2 logs` 中记录 EADDRINUSE，无告警 |
| 5 | 为什么 rollout 前没发现？ | Precheck 没有检查 root PM2 |

### 教训

1. **PM2 用户隔离不是默认认知** — root 和 ubuntu 各有独立 PM2 实例（`PM2_HOME=/root/.pm2` vs `/home/ubuntu/.pm2`）
2. **Shadow 启动前必须检查端口占用来源** — 只检查 `ss -lntp` 不够，需确认进程的 PM2 用户
3. **EADDRINUSE 是预警信号** — 应在第 3 次重启后人工介入，而不是等到 3387 次

---

## 2. root PM2 风险

### PM2 用户隔离机制

```bash
# ubuntu 用户 → PM2_HOME=/home/ubuntu/.pm2
pm2 list                    # 只显示 ubuntu 的进程

# root 用户 → PM2_HOME=/root/.pm2
sudo pm2 list               # 显示 root 的进程（独立实例）
sudo PM2_HOME=/root/.pm2 pm2 list
```

**风险**：root PM2 和 ubuntu PM2 完全独立，但**共享同一物理端口**。root PM2 启动 wecom-adapter → 占用 3001 → ubuntu PM2 的 wecom-adapter 永远起不来。

### 检测命令

```bash
# 检查 root PM2 是否有 wecom-adapter
sudo PM2_HOME=/root/.pm2 pm2 list | grep wecom-adapter

# 检查 3001 端口的进程所有者
sudo lsof -i :3001
# 输出示例：
# COMMAND    PID USER   ...
# node       123 root  ...   ← 危险！root 进程占用 3001

# 检查是否有多个 PM2 实例（不同用户）
ps aux | grep PM2 | grep -v grep
```

### 修复命令

```bash
# 从 root PM2 删除 wecom-adapter（释放 3001）
sudo pm2 delete wecom-adapter
sudo pm2 save --force

# 确认端口已释放
ss -lntp | grep ':3001 ' || echo '3001 FREE'

# 重启 ubuntu PM2 的 wecom-adapter
pm2 restart wecom-adapter --update-env
pm2 logs wecom-adapter --lines 10 --nostream  # 确认无 EADDRINUSE
```

---

## 3. Shadow 启动红线

shadow-safe-start.sh 实施的 4 条红线：

| # | 红线 | 检查方式 | 失败处理 |
|---|---|---|---|
| R1 | **禁止 port=3001** | 脚本参数检查：`if [ "$SHADOW_PORT" = "3001" ]` | 立即退出，exit 1 |
| R2 | **WECOM_ADAPTER_PORT 必须设置且 ≠ 3001** | 检查环境变量 | 立即退出，输出修复命令 |
| R3 | **端口不能被占用** | `ss -lntp \| grep :PORT` | 输出占用进程 PID，拒绝启动 |
| R4 | **root PM2 不能有 wecom-adapter** | `sudo PM2_HOME=/root/.pm2 pm2 list \| grep wecom-adapter` | 输出修复命令，拒绝启动 |

### Shadow 命名规范

```bash
# ✅ 正确：带功能前缀 + 端口后缀
wecom-passive-monitor-shadow   # port 39013
wecom-dashboard-shadow        # port 39014

# ❌ 错误：容易混淆
shadow
test
wecom-adapter-shadow         # 名字太像生产，容易误删
```

---

## 4. 回滚流程

### 触发条件

| 条件 | 检测命令 | 动作 |
|---|---|---|
| 3001 health fail | `curl -s --max-time 3 http://127.0.0.1:3001/health` | 立即回滚 |
| PM2 unstable（↺ > 5） | `pm2 status \| awk '/wecom-adapter/ {print $10}'` | 立即回滚 |
| Mission storm（> 10/min） | `tail -100 /tmp/mission-audit.jsonl \| wc -l` | 停止 monitoring，不回滚代码 |
| panic stop 失效 | `curl -s http://127.0.0.1:3001/health \| grep -i panic` | 重启 wecom-adapter |
| 误执行 mission | 检查 mission 日志 | 回滚代码 + 人工核查 |

### 回滚步骤

```bash
# Step 1: 停止 shadow（如果正在运行）
bash apps/wecom-adapter/scripts/shadow-safe-cleanup.sh wecom-passive-monitor-shadow 39013

# Step 2: 回滚代码到上一 commit
cd /opt/wecom-openclaw
git log --oneline -3   # 确认要回滚到的 commit
git reset --hard <previous-commit-sha>

# Step 3: 重启生产 wecom-adapter
pm2 restart wecom-adapter --update-env
sleep 3

# Step 4: 验证恢复
curl -s http://127.0.0.1:3001/health
pm2 status | grep wecom-adapter

# Step 5: 确认 root PM2 无 wecom-adapter
sudo PM2_HOME=/root/.pm2 pm2 list | grep wecom-adapter || echo "OK: root PM2 clean"
```

---

## 5. 端口检查命令速查

```bash
# 检查端口是否被占用
ss -lntp | grep ':3001 '          # Linux
lsof -i :3001                     # macOS / Linux

# 找出占用端口的进程和 USER
sudo lsof -i :3001 | grep LISTEN

# 检查进程属于哪个 PM2 实例
sudo lsof -i :3001 | awk '/node/ {print $2}' | xargs -I{} ps -p {} -o user,pid,cmd

# 检查 root PM2 是否有 wecom-adapter
sudo PM2_HOME=/root/.pm2 pm2 list | grep wecom-adapter

# 检查 ubuntu PM2 进程数
pm2 status | grep -c "online"

# 检查某个端口的响应是否是 zombie（对比 PID）
curl -s http://127.0.0.1:3001/health
sudo lsof -i :3001   # 对比响应中的 PID 是否等于 pm2 status 中的 PID
```

---

## 6. PM2 用户隔离规范

### 规范

1. **生产只使用 ubuntu PM2**
   ```bash
   # ✅ 正确
   pm2 start ...        # ubuntu 用户
   
   # ❌ 禁止
   sudo pm2 start ...   # root 用户
   ```

2. **禁止在 root PM2 中运行任何 wecom-adapter 相关进程**
   ```bash
   # 检查（每次 rollout 前必须执行）
   sudo PM2_HOME=/root/.pm2 pm2 list | grep -E 'wecom|openclaw'
   # 期望输出：空（无结果）
   ```

3. **Shadow 必须用 WECOM_ADAPTER_PORT 显式设置端口**
   ```bash
   # ✅ 正确
   WECOM_ADAPTER_PORT=39013 pm2 start ... --name wecom-xxx-shadow
   
   # ❌ 禁止（会用默认 3001）
   pm2 start ... --name wecom-xxx-shadow
   ```

4. **Rollout 前 Precheck 必须包含 root PM2 检查**
   ```bash
   # Precheck 脚本片段
   echo "=== Root PM2 Check ==="
   if sudo PM2_HOME=/root/.pm2 pm2 list 2>/dev/null | grep -q wecom-adapter; then
     echo "[FATAL] Root PM2 has wecom-adapter! Aborting rollout."
     exit 1
   fi
   ```

### PM2 常用命令对照表

| 操作 | ubuntu PM2 | root PM2 |
|---|---|---|
| 查看进程 | `pm2 status` | `sudo pm2 status` |
| 启动进程 | `pm2 start ...` | **禁止** |
| 停止进程 | `pm2 delete <name>` | `sudo pm2 delete <name>` |
| 查看日志 | `pm2 logs <name>` | `sudo pm2 logs <name>` |
| 保存当前进程列表 | `pm2 save` | `sudo pm2 save` |

---

## 7. Shadow 安全启动检查清单

每次启动 shadow 前，手动执行以下检查（script 会自动执行，但人工确认更安全）：

```bash
# ✅ 1. 端口未被占用
ss -lntp | grep ':39013 ' || echo "OK: 39013 free"

# ✅ 2. root PM2 无 wecom-adapter
sudo PM2_HOME=/root/.pm2 pm2 list | grep wecom-adapter || echo "OK: root PM2 clean"

# ✅ 3. 生产 3001 正常响应
curl -s http://127.0.0.1:3001/health

# ✅ 4. WECOM_ADAPTER_PORT 已设置（不等于 3001）
echo $WECOM_ADAPTER_PORT   # 应该是 shadow port

# ✅ 5. 启动 shadow
bash apps/wecom-adapter/scripts/shadow-safe-start.sh 39013 wecom-passive-monitor-shadow

# ✅ 6. 验证 shadow health
curl -s http://127.0.0.1:39013/health

# ✅ 7. 确认 3001 仍由生产响应
curl -s http://127.0.0.1:3001/health
```

---

## 8. 紧急联系人

| 角色 | 姓名 | 联系方式 |
|---|---|---|
| 技术负责人 | HaoZhongLiang | ... |
| 运维负责人 | ... | ... |

---

## Changelog

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-05-28 | 初始版本，事故复盘 + 安全规范 |
