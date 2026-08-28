import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CodexAgentServer, atlasAgentInstructions, atlasDynamicTools } from './codex-agent.mjs';

export const providerTemplates = {
  codex: { id: 'codex', name: 'Codex CLI', transport: 'codex-app-server', executable: 'codex', model: 'gpt-5.6-luna', authCommand: ['codex', 'login'], statusCommand: ['codex', 'login', 'status'], usageMode: 'native', mcp: true },
  claude: { id: 'claude', name: 'Claude Code', transport: 'structured-cli', executable: 'claude', model: '', args: ['-p', '{prompt}', '--output-format', 'json'], authCommand: ['claude', 'auth', 'login'], statusCommand: ['claude', 'auth', 'status'], usageMode: 'manual', mcp: true },
  antigravity: { id: 'antigravity', name: 'Antigravity CLI', transport: 'structured-cli', executable: 'agy', model: '', args: ['-p', '{prompt}', '--output-format', 'json'], authCommand: ['agy'], statusCommand: ['agy', '--version'], usageCommand: ['agy', '-p', '/usage'], usageMode: 'command', mcp: true },
  cursor: { id: 'cursor', name: 'Cursor Agent', transport: 'structured-cli', executable: 'cursor-agent', model: '', args: ['-p', '{prompt}', '--output-format', 'json'], authCommand: ['cursor-agent', 'login'], statusCommand: ['cursor-agent', 'status'], usageMode: 'manual', mcp: true },
  openclaw: { id: 'openclaw', name: 'OpenClaw', transport: 'structured-cli', executable: 'openclaw', model: '', args: ['agent', 'exec', '{prompt}', '--cwd', '{cwd}', '--json'], authCommand: ['openclaw', 'onboard'], statusCommand: ['openclaw', 'status'], usageMode: 'manual', mcp: true },
  hermes: { id: 'hermes', name: 'Hermes Agent', transport: 'structured-cli', executable: 'hermes', model: '', args: ['-z', '{prompt}'], authCommand: ['hermes'], statusCommand: ['hermes', 'status'], usageMode: 'manual', mcp: true },
  custom: { id: 'custom', name: 'Custom CLI', transport: 'structured-cli', executable: '', model: '', args: ['{prompt}'], authCommand: [], statusCommand: [], usageMode: 'manual', mcp: false },
  'openai-compatible': { id: 'openai-compatible', name: 'OpenAI-compatible URL', transport: 'openai-compatible', executable: '', model: '', baseUrl: 'https://api.openai.com/v1', usageMode: 'manual', mcp: true }
};

export function normalizedProviderConfig(value = {}) {
  const template = providerTemplates[value.id] || providerTemplates.codex;
  return {
    ...template,
    ...value,
    id: template.id,
    args: Array.isArray(value.args) ? value.args.map(String) : [...(template.args || [])],
    authCommand: Array.isArray(value.authCommand) ? value.authCommand.map(String) : [...(template.authCommand || [])],
    statusCommand: Array.isArray(value.statusCommand) ? value.statusCommand.map(String) : [...(template.statusCommand || [])],
    usageCommand: Array.isArray(value.usageCommand) ? value.usageCommand.map(String) : [...(template.usageCommand || [])]
  };
}

function executableExists(executable) {
  if (!executable) return false;
  if (path.isAbsolute(executable)) return fs.existsSync(executable);
  return String(process.env.PATH || '').split(path.delimiter).some((folder) => fs.existsSync(path.join(folder, executable)));
}

function runCommand(command, args = [], { cwd, input = '', timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: process.env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${command} timed out`)); }, timeout);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(new Error((stderr || stdout || `${command} exited with code ${code}`).trim()));
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

function commandArgs(config, prompt) {
  const values = { prompt, cwd: config.cwd || process.cwd(), model: config.model || '', effort: config.effort || 'medium' };
  const args = (config.args || []).map((entry) => String(entry).replace(/\{(prompt|cwd|model|effort)\}/g, (_match, key) => values[key]));
  if (!args.some((entry) => entry.includes(prompt)) && !(config.args || []).includes('{prompt}')) args.push(prompt);
  if (config.model && !args.some((entry) => entry === config.model) && !config.args?.some((entry) => entry.includes('{model}'))) {
    if (['claude', 'cursor', 'antigravity', 'openclaw'].includes(config.id)) args.push('--model', config.model);
  }
  if (config.id === 'openclaw' && !args.includes('--thinking')) args.push('--thinking', config.effort || 'medium');
  return args;
}

function extractCliText(providerId, output) {
  const trimmed = String(output || '').trim();
  if (!trimmed) return '';
  try {
    const data = JSON.parse(trimmed.split(/\r?\n/).filter(Boolean).at(-1));
    if (providerId === 'claude') return data.result || data.message?.content?.map?.((part) => part.text || '').join('') || trimmed;
    if (providerId === 'cursor') return data.result || data.text || trimmed;
    if (providerId === 'antigravity') return data.result?.response || data.response || data.text || trimmed;
    if (providerId === 'openclaw') return data.final || data.payloads?.map?.((item) => item.text || '').join('\n') || trimmed;
    return data.result || data.response || data.text || data.message || trimmed;
  } catch {
    return trimmed;
  }
}

function parseAtlasToolCall(text) {
  const candidates = [String(text || '').trim(), ...(String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/gi) || []).map((block) => block.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim())];
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value?.type === 'tool_call' && typeof value.name === 'string') return value;
      if (value?.type === 'final' && typeof value.text === 'string') return value;
    } catch {}
  }
  return null;
}

function toolProtocolPrompt({ text, context, history, toolResults = [] }) {
  const tools = atlasDynamicTools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
  return `${atlasAgentInstructions}\n\nATLAS is using a portable CLI adapter. You may call one ATLAS tool at a time by replying with only JSON: {"type":"tool_call","name":"atlas_tool_name","arguments":{...}}. When finished, reply with {"type":"final","text":"your response"}. Do not wrap JSON in markdown.\n\nAvailable ATLAS tools:\n${JSON.stringify(tools)}\n\nCurrent ATLAS context:\n${JSON.stringify(context)}\n\nRecent conversation:\n${JSON.stringify(history || [])}\n\nCompleted tool results this turn:\n${JSON.stringify(toolResults)}\n\nUser request:\n${text}`;
}

class StructuredCliAgentServer extends EventEmitter {
  constructor({ cwd, executeTool, config }) {
    super();
    this.cwd = cwd;
    this.executeTool = executeTool;
    this.config = normalizedProviderConfig({ ...config, cwd });
    this.threads = new Map();
  }

  async start() {
    if (!executableExists(this.config.executable)) throw new Error(`${this.config.name} is not installed or its executable path is incorrect.`);
    const status = { state: 'ready', providerId: this.config.id, providerName: this.config.name, auth: 'Managed by CLI', model: this.config.model || 'CLI default', effort: this.config.effort || 'medium', tools: atlasDynamicTools.length, mcp: Boolean(this.config.mcp) };
    this.emit('status', status);
    return status;
  }

  async createThread() {
    await this.start();
    const thread = { id: `${this.config.id}-${randomUUID()}` };
    this.threads.set(thread.id, []);
    return thread;
  }

  async sendTurn({ threadId, text, context, history = [] }) {
    await this.start();
    if (!this.threads.has(threadId)) this.threads.set(threadId, history || []);
    queueMicrotask(() => this.#runTurn({ threadId, text, context, history }).catch((error) => {
      const itemId = `agent-${randomUUID()}`;
      this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, itemId, delta: `Provider error: ${error.message}` } });
      this.emit('event', { method: 'item/completed', params: { threadId, item: { id: itemId, type: 'agentMessage' } } });
      this.emit('event', { method: 'turn/completed', params: { threadId, turn: { status: 'failed' } } });
    }));
    return { turn: { id: randomUUID(), status: 'inProgress' } };
  }

  async #runTurn({ threadId, text, context, history }) {
    const toolResults = [];
    let finalText = '';
    for (let step = 0; step < 12; step += 1) {
      const prompt = toolProtocolPrompt({ text, context, history, toolResults });
      const result = await runCommand(this.config.executable, commandArgs(this.config, prompt), { cwd: this.cwd, timeout: Number(this.config.timeoutMs) || 300000 });
      const rawText = extractCliText(this.config.id, result.stdout);
      const protocol = parseAtlasToolCall(rawText);
      if (protocol?.type === 'tool_call') {
        this.emit('event', { method: 'atlas/providerTool', params: { threadId, providerId: this.config.id, tool: protocol.name, state: 'started' } });
        try {
          const output = await this.executeTool({ threadId, tool: protocol.name, arguments: protocol.arguments || {} });
          toolResults.push({ tool: protocol.name, output });
          this.emit('event', { method: 'atlas/providerTool', params: { threadId, providerId: this.config.id, tool: protocol.name, state: 'completed' } });
        } catch (error) {
          toolResults.push({ tool: protocol.name, error: error.message });
          this.emit('event', { method: 'atlas/providerTool', params: { threadId, providerId: this.config.id, tool: protocol.name, state: 'failed', error: error.message } });
        }
        continue;
      }
      finalText = protocol?.type === 'final' ? protocol.text : rawText;
      break;
    }
    if (!finalText) finalText = 'The provider did not return a final response.';
    const itemId = `agent-${randomUUID()}`;
    this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, itemId, delta: finalText } });
    this.emit('event', { method: 'item/completed', params: { threadId, item: { id: itemId, type: 'agentMessage', text: finalText } } });
    this.emit('event', { method: 'turn/completed', params: { threadId, turn: { status: 'completed' } } });
  }

  async readThread(threadId) { return { thread: { id: threadId, turns: [] } }; }
  async compactThread(threadId) { this.threads.set(threadId, []); this.emit('event', { method: 'thread/compacted', params: { threadId } }); return {}; }
  async deleteThread(threadId) { this.threads.delete(threadId); return {}; }
  stop() {}
}

class OpenAiCompatibleAgentServer extends EventEmitter {
  constructor({ cwd, executeTool, config, getSecret }) {
    super();
    this.cwd = cwd;
    this.executeTool = executeTool;
    this.config = normalizedProviderConfig(config);
    this.getSecret = getSecret;
  }
  async start() {
    if (!this.config.baseUrl || !this.config.model) throw new Error('Configure a base URL and model first.');
    if (!(await this.getSecret())) throw new Error('Add an API key for this provider in Settings.');
    const status = { state: 'ready', providerId: this.config.id, providerName: this.config.name, auth: 'Encrypted API key', model: this.config.model, effort: this.config.effort || 'medium', tools: atlasDynamicTools.length, mcp: true };
    this.emit('status', status); return status;
  }
  async createThread() { await this.start(); return { id: `openai-compatible-${randomUUID()}` }; }
  async sendTurn({ threadId, text, context, history = [] }) {
    await this.start();
    queueMicrotask(() => this.#runTurn({ threadId, text, context, history }).catch((error) => {
      const itemId = `agent-${randomUUID()}`;
      this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, itemId, delta: `Provider error: ${error.message}` } });
      this.emit('event', { method: 'turn/completed', params: { threadId, turn: { status: 'failed' } } });
    }));
    return { turn: { id: randomUUID(), status: 'inProgress' } };
  }
  async #runTurn({ threadId, text, context, history }) {
    const key = await this.getSecret();
    const messages = [...(history || []).slice(-24).map((message) => ({ role: message.role, content: message.text })), { role: 'user', content: `${text}\n\nATLAS context:\n${JSON.stringify(context)}` }];
    const tools = atlasDynamicTools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
    let finalText = '';
    for (let step = 0; step < 12; step += 1) {
      const response = await fetch(`${String(this.config.baseUrl).replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.config.model, messages: [{ role: 'system', content: atlasAgentInstructions }, ...messages], tools, tool_choice: 'auto' }) });
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error('Provider returned no assistant message.');
      messages.push(message);
      if (!message.tool_calls?.length) { finalText = message.content || ''; break; }
      for (const call of message.tool_calls) {
        const name = call.function?.name;
        let args = {}; try { args = JSON.parse(call.function?.arguments || '{}'); } catch {}
        this.emit('event', { method: 'atlas/providerTool', params: { threadId, providerId: this.config.id, tool: name, state: 'started' } });
        let output;
        try { output = await this.executeTool({ threadId, tool: name, arguments: args }); }
        catch (error) { output = { error: error.message }; }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
        this.emit('event', { method: 'atlas/providerTool', params: { threadId, providerId: this.config.id, tool: name, state: output?.error ? 'failed' : 'completed' } });
      }
    }
    const itemId = `agent-${randomUUID()}`;
    this.emit('event', { method: 'item/agentMessage/delta', params: { threadId, itemId, delta: finalText || 'The provider returned no final text.' } });
    this.emit('event', { method: 'turn/completed', params: { threadId, turn: { status: 'completed' } } });
  }
  async readThread(threadId) { return { thread: { id: threadId, turns: [] } }; }
  async compactThread(threadId) { this.emit('event', { method: 'thread/compacted', params: { threadId } }); return {}; }
  async deleteThread() { return {}; }
  stop() {}
}

export class AgentProviderManager extends EventEmitter {
  constructor({ cwd, executeTool, getSecret }) {
    super(); this.cwd = cwd; this.executeTool = executeTool; this.getSecret = getSecret; this.config = normalizedProviderConfig({ id: 'codex' }); this.server = null;
  }
  configure(config) {
    const next = normalizedProviderConfig(config);
    const changed = JSON.stringify(next) !== JSON.stringify(this.config);
    this.config = next;
    if (changed) this.#replaceServer();
    return this.publicConfig();
  }
  publicConfig() { const { apiKey: _removed, ...safe } = this.config; return { ...safe, installed: this.config.transport === 'openai-compatible' || executableExists(this.config.executable) }; }
  #replaceServer() {
    this.server?.removeAllListeners();
    this.server?.stop();
    if (this.config.transport === 'codex-app-server') this.server = new CodexAgentServer({ cwd: this.cwd, executeTool: this.executeTool, model: this.config.model, effort: this.config.effort, executable: this.config.executable });
    else if (this.config.transport === 'openai-compatible') this.server = new OpenAiCompatibleAgentServer({ cwd: this.cwd, executeTool: this.executeTool, config: this.config, getSecret: this.getSecret });
    else this.server = new StructuredCliAgentServer({ cwd: this.cwd, executeTool: this.executeTool, config: this.config });
    this.server.on('status', (status) => this.emit('status', status));
    this.server.on('event', (event) => this.emit('event', event));
    this.server.on('log', (message) => this.emit('log', message));
  }
  #active() { if (!this.server) this.#replaceServer(); return this.server; }
  start() { return this.#active().start(); }
  createThread() { return this.#active().createThread(); }
  sendTurn(payload) { return this.#active().sendTurn(payload); }
  readThread(id) { return this.#active().readThread(id); }
  compactThread(id) { return this.#active().compactThread(id); }
  deleteThread(id) { return this.#active().deleteThread(id); }
  async getUsage() {
    if (this.config.id === 'codex') return { providerId: 'codex', source: 'native', payload: await this.#active().getRateLimits() };
    if (this.config.usageMode === 'manual') {
      const value = this.config.manualUsageRemaining;
      const remainingPercent = value === null || value === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);
      return { providerId: this.config.id, source: remainingPercent === undefined ? 'unavailable' : 'manual', remainingPercent };
    }
    if (this.config.usageMode === 'command' && this.config.usageCommand?.length) {
      const [command, ...args] = this.config.usageCommand;
      const result = await runCommand(command, args, { cwd: this.cwd, timeout: 30000 });
      const matches = [...`${result.stdout}\n${result.stderr}`.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]));
      const remaining = matches.length ? Math.min(...matches) : NaN;
      return { providerId: this.config.id, source: 'command', remainingPercent: remaining, detail: `${this.config.name} CLI` };
    }
    return { providerId: this.config.id, source: 'unavailable' };
  }
  async test() {
    if (this.config.id === 'codex') {
      try { const status = await this.start(); return { ok: status.state === 'ready', message: `${status.providerName} is ready with ${status.auth}.` }; }
      catch (error) { return { ok: false, message: error.message }; }
    }
    if (this.config.transport === 'openai-compatible') { await this.start(); return { ok: true, message: 'Configuration and encrypted credential are present.' }; }
    if (!executableExists(this.config.executable)) return { ok: false, message: `${this.config.executable || this.config.name} was not found on PATH.` };
    const command = this.config.statusCommand?.length ? this.config.statusCommand : [this.config.executable, '--version'];
    try { const result = await runCommand(command[0], command.slice(1), { cwd: this.cwd, timeout: 30000 }); return { ok: true, message: (result.stdout || result.stderr || 'CLI is available').trim().slice(0, 1000) }; }
    catch (error) { return { ok: false, message: error.message }; }
  }
  stop() { this.server?.stop(); }
}
