#!/usr/bin/env node

const tools = [
  {
    name: "echo",
    description: "Return the provided text unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to echo." }
      },
      required: ["text"],
      additionalProperties: false
    }
  },
  {
    name: "extract_tasks",
    description: "Extract simple task-like lines from pasted notes.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Notes or transcript text." }
      },
      required: ["text"],
      additionalProperties: false
    }
  },
  {
    name: "make_checklist",
    description: "Create a Markdown checklist from a title and item list.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Checklist title." },
        items: {
          type: "array",
          items: { type: "string" },
          description: "Checklist items."
        }
      },
      required: ["title", "items"],
      additionalProperties: false
    }
  }
];

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) handleLine(line);
  }
});

function handleLine(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    writeError(null, -32700, "Parse error");
    return;
  }

  if (request.id === undefined) return;

  try {
    switch (request.method) {
      case "initialize":
        writeResult(request.id, {
          protocolVersion: "2025-11-25",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "handagent-demo", version: "1.0.0" }
        });
        break;
      case "tools/list":
        writeResult(request.id, { tools });
        break;
      case "tools/call":
        writeResult(request.id, callTool(request.params));
        break;
      default:
        writeError(request.id, -32601, `Method not found: ${request.method}`);
    }
  } catch (error) {
    writeError(request.id, -32602, error instanceof Error ? error.message : String(error));
  }
}

function callTool(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (name === "echo") {
    const text = readString(args, "text");
    return textResult(text);
  }
  if (name === "extract_tasks") {
    const text = readString(args, "text");
    return textResult(JSON.stringify({ tasks: extractTasks(text) }, null, 2));
  }
  if (name === "make_checklist") {
    const title = readString(args, "title");
    const items = readStringArray(args, "items");
    return textResult(toChecklist(title, items));
  }
  throw new Error(`Unknown tool: ${name}`);
}

function extractTasks(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(todo|task|action|待办|行动项)[:：\-\s]/i.test(line))
    .map((line) => line.replace(/^(todo|task|action|待办|行动项)[:：\-\s]*/i, "").trim())
    .filter(Boolean);
}

function toChecklist(title, items) {
  const body = items.map((item) => `- [ ] ${item}`).join("\n");
  return `# ${title}\n\n${body}`;
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function readString(args, key) {
  if (typeof args?.[key] !== "string") {
    throw new Error(`${key} must be a string`);
  }
  return args[key];
}

function readStringArray(args, key) {
  if (!Array.isArray(args?.[key]) || !args[key].every((item) => typeof item === "string")) {
    throw new Error(`${key} must be a string array`);
  }
  return args[key];
}

function writeResult(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function writeError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}
