// ============================================================
// 🔌 MCP Client — Phase 1: JobSpy + Remote MCPs
//    Hardened: timeout, reconnect, concurrency, validation
// ============================================================

const { spawn } = require('child_process');
const axios = require('axios');

// ─── Constants ───
const DEFAULT_TIMEOUT = 10000;
const CALL_TIMEOUT = 30000;
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 2;

// ─── MCP Server Manager ───
class MCPClient {
  constructor() {
    this.servers = new Map();
    this.activeCalls = 0;
    this.callQueue = [];
  }

  // Connect to an MCP server via stdio
  async connect(name, command, args = []) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`MCP [${name}] connection timed out after ${DEFAULT_TIMEOUT}ms`));
      }, DEFAULT_TIMEOUT);

      try {
        const server = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
          shell: process.platform === 'win32',
        });

        let resolved = false;

        server.on('error', (err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            this.servers.delete(name);
            reject(new Error(`MCP [${name}] spawn error: ${err.message}`));
          }
        });

        server.on('exit', (code) => {
          console.warn(`⚠️ MCP [${name}] exited with code ${code}`);
          const serverData = this.servers.get(name);
          if (serverData) {
            serverData.connected = false;
            // Reject all pending calls
            for (const [, pending] of serverData.pending) {
              pending.reject(new Error(`MCP [${name}] disconnected`));
            }
            serverData.pending.clear();
          }
          this.servers.delete(name);
        });

        server.stderr.on('data', (data) => {
          // MCP servers log to stderr, ignore unless debugging
        });

        const serverData = {
          process: server,
          pending: new Map(),
          connected: true,
          name,
          command,
          args,
        };

        this.servers.set(name, serverData);

        // Handle responses
        server.stdout.on('data', (data) => {
          this._handleResponse(name, data);
        });

        // Mark as connected after brief delay (server needs to init)
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            console.log(`✅ MCP [${name}] connected`);
            resolve(this);
          }
        }, 500);
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`MCP [${name}] spawn failed: ${err.message}`));
      }
    });
  }

  // Reconnect a disconnected server
  async reconnect(name) {
    const serverData = this.servers.get(name);
    if (serverData && !serverData.connected) {
      console.log(`🔄 MCP [${name}] reconnecting...`);
      this.servers.delete(name);
      return this.connect(name, serverData.command, serverData.args);
    }
    return this;
  }

  // Call a tool on an MCP server with concurrency control
  async callTool(serverName, toolName, args = {}, retries = 0) {
    // Concurrency control
    if (this.activeCalls >= MAX_CONCURRENT) {
      await new Promise(resolve => this.callQueue.push(resolve));
    }

    this.activeCalls++;

    try {
      const server = this.servers.get(serverName);
      if (!server || !server.connected) {
        // Try reconnect once
        if (server && !server.connected && retries === 0) {
          await this.reconnect(serverName);
          this.activeCalls--;
          return this.callTool(serverName, toolName, args, retries + 1);
        }
        throw new Error(`MCP server ${serverName} not connected`);
      }

      const request = {
        jsonrpc: '2.0',
        id: Date.now() + Math.random(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      };

      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          server.pending.delete(request.id);
          reject(new Error(`MCP call timeout: ${serverName}/${toolName}`));
        }, CALL_TIMEOUT);

        server.pending.set(request.id, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        });

        try {
          server.process.stdin.write(JSON.stringify(request) + '\n');
        } catch (err) {
          server.pending.delete(request.id);
          reject(err);
        }
      });

      return result;
    } catch (err) {
      // Retry on transient errors
      if (retries < MAX_RETRIES && (err.message.includes('timeout') || err.message.includes('disconnected'))) {
        console.warn(`⚠️ MCP [${serverName}] retry ${retries + 1}/${MAX_RETRIES}`);
        await this.reconnect(serverName);
        return this.callTool(serverName, toolName, args, retries + 1);
      }
      throw err;
    } finally {
      this.activeCalls--;
      if (this.callQueue.length > 0) {
        this.callQueue.shift()();
      }
    }
  }

  // Handle response from MCP server
  _handleResponse(name, data) {
    const server = this.servers.get(name);
    if (!server) return;

    try {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        const response = JSON.parse(line);
        if (response.id && server.pending.has(response.id)) {
          const { resolve, reject } = server.pending.get(response.id);
          server.pending.delete(response.id);
          if (response.error) {
            reject(new Error(response.error.message || 'MCP error'));
          } else {
            resolve(response.result);
          }
        }
      }
    } catch (err) {
      // Non-JSON output, ignore
    }
  }

  // List available tools on a server
  async listTools(serverName) {
    const server = this.servers.get(serverName);
    if (!server || !server.connected) {
      throw new Error(`MCP server ${serverName} not connected`);
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {},
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout listing tools')), 10000);
      server.pending.set(request.id, {
        resolve: (result) => { clearTimeout(timeout); resolve(result); },
        reject: (err) => { clearTimeout(timeout); reject(err); },
      });
      server.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  // Check if server is connected
  isConnected(name) {
    const server = this.servers.get(name);
    return server && server.connected;
  }

  // Get connection status for all servers
  status() {
    const result = {};
    for (const [name, server] of this.servers) {
      result[name] = {
        connected: server.connected,
        pendingCalls: server.pending.size,
      };
    }
    return result;
  }

  // Disconnect a specific server
  disconnect(name) {
    const server = this.servers.get(name);
    if (server) {
      server.connected = false;
      // Reject pending calls
      for (const [, pending] of server.pending) {
        pending.reject(new Error(`MCP [${name}] disconnecting`));
      }
      server.pending.clear();
      try { server.process.kill(); } catch (e) {}
      this.servers.delete(name);
    }
  }

  // Disconnect all servers
  disconnectAll() {
    for (const [name] of this.servers) {
      this.disconnect(name);
    }
  }
}

// ─── HTTP MCP Client (for remote MCP servers) ───
class HTTPMCPClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.client = axios.create({
      timeout: CALL_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async callTool(toolName, args = {}) {
    const response = await this.client.post(`${this.baseUrl}/tools/call`, {
      name: toolName,
      arguments: args,
    });
    return response.data;
  }

  async listTools() {
    const response = await this.client.get(`${this.baseUrl}/tools`);
    return response.data;
  }
}

// ─── JobSpy MCP Wrapper (pre-configured) ───
class JobSpyMCP {
  constructor() {
    this.client = new MCPClient();
    this.name = 'jobspy';
  }

  async connect() {
    try {
      await this.client.connect(this.name, 'npx', [
        '-y',
        'jobspy-mcp-server@latest',
      ]);
      return this;
    } catch (err) {
      console.error('⚠️ JobSpy MCP unavailable, falling back to direct APIs');
      return this;
    }
  }

  async searchJobs(query, options = {}) {
    if (!this.client.isConnected(this.name)) {
      console.warn('⚠️ JobSpy not connected, skipping');
      return [];
    }

    try {
      const result = await this.client.callTool(this.name, 'search_jobs', {
        query,
        ...options,
      });
      return this._parseResults(result);
    } catch (err) {
      console.error('⚠️ JobSpy search error:', err.message);
      return [];
    }
  }

  _parseResults(result) {
    if (!result || !result.content) return [];
    const jobs = Array.isArray(result.content) ? result.content : [result.content];
    return jobs.map(j => ({
      title: j.title || j.position || 'Unknown',
      company: j.company || j.company_name || 'Unknown',
      location: j.location || 'Remote',
      salary: j.salary || null,
      url: j.url || j.apply_url || '#',
      source: 'JobSpy (LinkedIn/Indeed/Google)',
      description: (j.description || j.text || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: j.tags || [],
      postedAt: j.date_posted || j.posted_at || null,
    }));
  }

  disconnect() {
    this.client.disconnect(this.name);
  }
}

// ─── Export ───
module.exports = {
  MCPClient,
  HTTPMCPClient,
  JobSpyMCP,
};
