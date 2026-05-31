'use strict';

/**
 * wecom-mission-center.js - P11.1 WeCom Mission Center
 *
 * 职责: 企业微信任务入口，将企微消息转换为 Commander Mission
 *
 * API:
 *   POST /wecom/mission                  → 创建 mission
 *   GET  /wecom/mission/:mission_id      → 查询详情
 *   POST /wecom/mission/:mission_id/heartbeat → 心跳
 *
 * 不破坏原有 /wecom/callback
 */

var wecomFormat = require('./wecom-mission-format');
var http = require('http');

// ─── 内部 HTTP 调用 Commander Gateway ──────────────────────

var COMMANDER_PORT = process.env.WECOM_ADAPTER_PORT || 3001;
var COMMANDER_HOST = '127.0.0.1';

/**
 * 内部调用 POST /commander/mission
 *
 * @param {object} missionReq - { source, text, operator, room }
 * @param {function} callback - (err, result)
 */
function callCommanderCreate(missionReq, callback) {
  var postData = JSON.stringify(missionReq);

  var options = {
    hostname: COMMANDER_HOST,
    port: COMMANDER_PORT,
    path: '/commander/mission',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 30000
  };

  var req = http.request(options, function(res) {
    var body = '';
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
      try {
        var data = JSON.parse(body);
        callback(null, data, res.statusCode);
      } catch (e) {
        callback(new Error('JSON parse error: ' + e.message), body, res.statusCode);
      }
    });
  });

  req.on('error', function(e) {
    callback(e, null, 0);
  });

  req.on('timeout', function() {
    req.destroy();
    callback(new Error('Commander Gateway timeout'), null, 0);
  });

  req.write(postData);
  req.end();
}

/**
 * 内部调用 GET /commander/mission/:id/status
 */
function callCommanderStatus(missionId, callback) {
  var options = {
    hostname: COMMANDER_HOST,
    port: COMMANDER_PORT,
    path: '/commander/mission/' + encodeURIComponent(missionId) + '/status',
    method: 'GET',
    timeout: 10000
  };

  var req = http.get(options, function(res) {
    var body = '';
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
      try {
        var data = JSON.parse(body);
        callback(null, data, res.statusCode);
      } catch (e) {
        callback(new Error('JSON parse error: ' + e.message), body, res.statusCode);
      }
    });
  });

  req.on('error', function(e) {
    callback(e, null, 0);
  });

  req.on('timeout', function() {
    req.destroy();
    callback(new Error('Status query timeout'), null, 0);
  });
}

/**
 * 内部调用 POST /commander/mission/:id/approve
 */
function callCommanderApprove(missionId, action, operator, callback) {
  var postData = JSON.stringify({
    action: action,
    operator: operator || 'wecom',
    reason: 'Approved via WeCom'
  });

  var options = {
    hostname: COMMANDER_HOST,
    port: COMMANDER_PORT,
    path: '/commander/mission/' + encodeURIComponent(missionId) + '/approve',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 30000
  };

  var req = http.request(options, function(res) {
    var body = '';
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
      try {
        var data = JSON.parse(body);
        callback(null, data, res.statusCode);
      } catch (e) {
        callback(new Error('JSON parse error: ' + e.message), body, res.statusCode);
      }
    });
  });

  req.on('error', function(e) {
    callback(e, null, 0);
  });

  req.on('timeout', function() {
    req.destroy();
    callback(new Error('Approve timeout'), null, 0);
  });

  req.write(postData);
  req.end();
}

/**
 * 内部调用 GET /commander/mission/:id/artifacts
 */
function callCommanderArtifacts(missionId, callback) {
  var options = {
    hostname: COMMANDER_HOST,
    port: COMMANDER_PORT,
    path: '/commander/mission/' + encodeURIComponent(missionId) + '/artifacts',
    method: 'GET',
    timeout: 10000
  };

  var req = http.get(options, function(res) {
    var body = '';
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
      try {
        var data = JSON.parse(body);
        callback(null, data, res.statusCode);
      } catch (e) {
        callback(new Error('JSON parse error: ' + e.message), body, res.statusCode);
      }
    });
  });

  req.on('error', function(e) {
    callback(e, null, 0);
  });

  req.on('timeout', function() {
    req.destroy();
    callback(new Error('Artifacts query timeout'), null, 0);
  });
}

// ─── WeCom 消息解析 ────────────────────────────────────────

/**
 * 解析企业微信消息
 *
 * @param {object} wecomMsg - { FromUserName, RoomId?, Content }
 * @returns {object} { isCommand, parsed, missionReq, replyMarkdown }
 */
function parseWeComMessage(wecomMsg) {
  if (!wecomMsg || !wecomMsg.Content) {
    return {
      isCommand: false,
      parsed: null,
      missionReq: null,
      replyMarkdown: wecomFormat.formatError('消息内容为空')
    };
  }

  var content = (wecomMsg.Content || '').trim();
  var operator = wecomMsg.FromUserName || 'unknown';
  var room = wecomMsg.RoomId || '';

  // 检查是否是指令
  var command = wecomFormat.parseCommand(content);

  if (command) {
    return {
      isCommand: true,
      parsed: command,
      missionReq: null,
      operator: operator,
      room: room
    };
  }

  // 不是指令 → 创建 mission
  return {
    isCommand: false,
    parsed: null,
    missionReq: {
      source: 'wecom',
      text: content,
      operator: operator,
      room: room
    },
    operator: operator,
    room: room
  };
}

// ─── POST /wecom/mission ──────────────────────────────────

/**
 * 创建 WeCom Mission
 *
 * Body: { FromUserName, RoomId?, Content }
 * 或直接: { text, operator, room?, source? }
 */
function handleWeComMission(req, res) {
  var body = req._wecomBody || {};

  // 支持两种输入格式
  var wecomMsg;
  if (body.FromUserName && body.Content) {
    // WeCom 格式
    wecomMsg = {
      FromUserName: body.FromUserName,
      RoomId: body.RoomId || '',
      Content: body.Content
    };
  } else if (body.text) {
    // 直接格式
    wecomMsg = {
      FromUserName: body.operator || 'unknown',
      RoomId: body.room || '',
      Content: body.text
    };
  } else {
    return res.status(400).json({
      success: false,
      error: '缺少 Content 或 text 字段',
      reply: wecomFormat.formatError('缺少任务描述')
    });
  }

  // 内容长度限制
  if (wecomMsg.Content && wecomMsg.Content.length > 2000) {
    return res.status(400).json({
      success: false,
      error: '消息内容超过 2000 字符',
      reply: wecomFormat.formatError('消息内容超过 2000 字符限制')
    });
  }

  // 解析消息
  var parsed = parseWeComMessage(wecomMsg);

  if (parsed.isCommand) {
    // 处理指令
    return handleWeComCommand(parsed.parsed, parsed.operator, parsed.room, res);
  }

  // 转换为 Commander Mission
  var missionReq = parsed.missionReq;
  if (!missionReq || !missionReq.text) {
    return res.status(400).json({
      success: false,
      error: '无效的任务请求',
      reply: wecomFormat.formatError('无法解析任务请求')
    });
  }

  // 调用 Commander Gateway 创建 mission
  callCommanderCreate(missionReq, function(err, result, statusCode) {
    if (err) {
      return res.status(502).json({
        success: false,
        error: 'Commander Gateway 不可用: ' + err.message,
        reply: wecomFormat.formatError('Commander Gateway 服务不可用')
      });
    }

    if (result.success) {
      var reply = wecomFormat.formatMissionCreated(
        result.mission_id,
        result.graph_id,
        result.mission_type,
        result.status
      );

      res.status(201).json({
        success: true,
        mission_id: result.mission_id,
        graph_id: result.graph_id,
        status: result.status,
        reply: reply,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(statusCode || 400).json({
        success: false,
        error: result.error,
        reply: wecomFormat.formatError(result.error || 'Mission 创建失败')
      });
    }
  });
}

// ─── 指令处理 ──────────────────────────────────────────────

/**
 * 处理 WeCom 指令
 */
function handleWeComCommand(command, operator, room, res) {
  var missionId = command.mission_id;

  switch (command.command) {
    case 'approve':
      if (!missionId) {
        return res.status(400).json({
          success: false,
          reply: wecomFormat.formatError('缺少 mission_id')
        });
      }
      callCommanderApprove(missionId, 'approve', operator, function(err, result) {
        if (err) {
          res.status(502).json({
            success: false,
            reply: wecomFormat.formatError('审批请求失败: ' + err.message)
          });
        } else {
          res.json({
            success: result.success || false,
            reply: wecomFormat.formatApprovalResult(missionId, 'approve', operator)
          });
        }
      });
      break;

    case 'reject':
      if (!missionId) {
        return res.status(400).json({
          success: false,
          reply: wecomFormat.formatError('缺少 mission_id')
        });
      }
      callCommanderApprove(missionId, 'reject', operator, function(err, result) {
        if (err) {
          res.status(502).json({
            success: false,
            reply: wecomFormat.formatError('拒绝请求失败: ' + err.message)
          });
        } else {
          res.json({
            success: result.success || false,
            reply: wecomFormat.formatApprovalResult(missionId, 'reject', operator)
          });
        }
      });
      break;

    case 'status':
      if (!missionId) {
        return res.status(400).json({
          success: false,
          reply: wecomFormat.formatError('缺少 mission_id')
        });
      }
      callCommanderStatus(missionId, function(err, statusResult) {
        if (err) {
          res.status(502).json({
            success: false,
            reply: wecomFormat.formatError('状态查询失败: ' + err.message)
          });
        } else if (statusResult.success) {
          // 根据 stage 生成不同格式
          var stage = statusResult.status ? statusResult.status.stage : 'unknown';
          var reply;
          switch (stage) {
            case 'completed':
              reply = wecomFormat.formatMissionCompleted(
                missionId,
                statusResult.artifact_count,
                'passed',
                'none'
              );
              break;
            case 'running':
              reply = wecomFormat.formatMissionRunning(
                missionId,
                statusResult.status.progress || 0,
                '',
                ''
              );
              break;
            case 'blocked':
              reply = wecomFormat.formatMissionBlocked(
                missionId,
                statusResult.status.approval_status || 'awaiting_approval'
              );
              break;
            case 'failed':
              reply = wecomFormat.formatMissionFailed(missionId, '', '');
              break;
            default:
              reply = wecomFormat.formatMissionDetail(
                missionId,
                statusResult.status,
                statusResult.graph
              );
              break;
          }
          res.json({ success: true, reply: reply });
        } else {
          res.json({
            success: false,
            reply: wecomFormat.formatError(statusResult.error || '查询失败')
          });
        }
      });
      break;

    case 'detail':
      if (!missionId) {
        return res.status(400).json({
          success: false,
          reply: wecomFormat.formatError('缺少 mission_id')
        });
      }
      callCommanderStatus(missionId, function(err, statusResult) {
        if (err) {
          res.status(502).json({
            success: false,
            reply: wecomFormat.formatError('详情查询失败: ' + err.message)
          });
        } else if (statusResult.success) {
          res.json({
            success: true,
            reply: wecomFormat.formatMissionDetail(
              missionId,
              statusResult.status,
              statusResult.graph
            )
          });
        } else {
          res.json({
            success: false,
            reply: wecomFormat.formatError(statusResult.error || '查询失败')
          });
        }
      });
      break;

    case 'artifacts':
      if (!missionId) {
        return res.status(400).json({
          success: false,
          reply: wecomFormat.formatError('缺少 mission_id')
        });
      }
      callCommanderArtifacts(missionId, function(err, artResult) {
        if (err) {
          res.status(502).json({
            success: false,
            reply: wecomFormat.formatError('Artifacts 查询失败: ' + err.message)
          });
        } else if (artResult.success) {
          res.json({
            success: true,
            reply: wecomFormat.formatArtifactsList(
              missionId,
              artResult.artifacts,
              artResult.count
            )
          });
        } else {
          res.json({
            success: false,
            reply: wecomFormat.formatError(artResult.error || '查询失败')
          });
        }
      });
      break;

    case 'help':
    default:
      res.json({
        success: true,
        reply: wecomFormat.formatHelp()
      });
      break;
  }
}

// ─── GET /wecom/mission/:mission_id ────────────────────────

/**
 * 查询 WeCom Mission 详情
 */
function handleWeComMissionGet(req, res) {
  var missionId = req.params.mission_id;

  if (!missionId || !/^[a-zA-Z0-9_-]+$/.test(missionId)) {
    return res.status(400).json({
      success: false,
      error: '无效的 mission_id'
    });
  }

  callCommanderStatus(missionId, function(err, statusResult) {
    if (err) {
      res.status(502).json({
        success: false,
        error: '查询失败: ' + err.message
      });
    } else if (statusResult.success) {
      res.json({
        success: true,
        mission_id: missionId,
        status: statusResult.status,
        graph: statusResult.graph,
        artifact_count: statusResult.artifact_count,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: statusResult.error || 'Mission 不存在'
      });
    }
  });
}

// ─── POST /wecom/mission/:mission_id/heartbeat ─────────────

/**
 * WeCom Mission 心跳
 */
function handleWeComHeartbeat(req, res) {
  var missionId = req.params.mission_id;

  if (!missionId || !/^[a-zA-Z0-9_-]+$/.test(missionId)) {
    return res.status(400).json({
      success: false,
      error: '无效的 mission_id'
    });
  }

  callCommanderStatus(missionId, function(err, statusResult) {
    if (err) {
      res.status(502).json({
        success: false,
        error: '查询失败: ' + err.message
      });
    } else if (statusResult.success) {
      var stage = statusResult.status ? statusResult.status.stage : 'unknown';
      var reply;
      if (stage === 'running') {
        reply = wecomFormat.formatMissionRunning(
          missionId,
          statusResult.status.progress || 0,
          '',
          ''
        );
      } else if (stage === 'completed') {
        reply = wecomFormat.formatMissionCompleted(
          missionId,
          statusResult.artifact_count,
          'passed',
          'none'
        );
      } else if (stage === 'blocked') {
        reply = wecomFormat.formatMissionBlocked(
          missionId,
          statusResult.status.approval_status || 'awaiting_approval'
        );
      } else {
        reply = wecomFormat.formatMissionDetail(
          missionId,
          statusResult.status,
          statusResult.graph
        );
      }

      res.json({
        success: true,
        mission_id: missionId,
        status: stage,
        heartbeat: reply,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: statusResult.error || 'Mission 不存在'
      });
    }
  });
}

// ─── Body Parser ──────────────────────────────────────────

var MAX_BODY_SIZE = 16 * 1024;

function parseWecomBody(req, res, next) {
  if (req.method !== 'POST') return next();

  var chunks = [];
  var totalSize = 0;

  req.on('data', function(chunk) {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY_SIZE) {
      res.status(413).json({ success: false, error: '请求体超过 16KB 限制' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', function() {
    var raw = Buffer.concat(chunks).toString('utf-8');
    try {
      req._wecomBody = JSON.parse(raw);
    } catch (e) {
      res.status(400).json({ success: false, error: 'JSON 解析失败: ' + e.message });
      return;
    }
    next();
  });

  req.on('error', function() {});
}

// ─── 路由注册 ──────────────────────────────────────────────

/**
 * 在 Express app 上注册 /wecom/mission/* 路由
 *
 * @param {object} app - Express app 实例
 */
function registerWecomMissionRoutes(app) {
  app.use('/wecom/mission', function(req, res, next) {
    if (req.method === 'POST') {
      return parseWecomBody(req, res, next);
    }
    next();
  });

  // POST /wecom/mission
  app.post('/wecom/mission', handleWeComMission);

  // POST /wecom/mission/:mission_id/heartbeat (必须在 GET /:mission_id 之前)
  app.post('/wecom/mission/:mission_id/heartbeat', handleWeComHeartbeat);

  // GET  /wecom/mission/:mission_id
  app.get('/wecom/mission/:mission_id', handleWeComMissionGet);
}

// ─── 导出 ──────────────────────────────────────────────────

module.exports = {
  registerWecomMissionRoutes: registerWecomMissionRoutes,
  // 导出内部函数供测试
  _parseWeComMessage: parseWeComMessage,
  _handleWeComCommand: handleWeComCommand,
  _handleWeComMission: handleWeComMission,
  _handleWeComMissionGet: handleWeComMissionGet,
  _handleWeComHeartbeat: handleWeComHeartbeat,
  _callCommanderCreate: callCommanderCreate,
  _callCommanderStatus: callCommanderStatus,
  _callCommanderApprove: callCommanderApprove,
  _callCommanderArtifacts: callCommanderArtifacts
};
