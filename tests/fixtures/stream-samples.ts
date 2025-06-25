export const streamSamples = {
  // Normal Claude Code JSON stream
  normalSession: [
    '{"id":"msg_01XQb5Q7GYFjDYmsk1RgFQBm","type":"message","role":"assistant","model":"claude-3-opus-20240229","content":[{"type":"text","text":"I\'ll help you create a sorting function."}],"stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":15,"output_tokens":10}}',
    '{"id":"msg_01XQb5Q7GYFjDYmsk1RgFQBn","type":"message","role":"user","model":"claude-3-opus-20240229","content":[{"type":"text","text":"Make it handle both numbers and strings"}],"stop_reason":null,"stop_sequence":null,"usage":null}',
    '{"id":"msg_01XQb5Q7GYFjDYmsk1RgFQBo","type":"message","role":"assistant","model":"claude-3-opus-20240229","content":[{"type":"text","text":"Here\'s a versatile sorting function:\\n\\n```javascript\\nfunction flexibleSort(arr, options = {}) {\\n  const { reverse = false, key = null } = options;\\n  \\n  return arr.slice().sort((a, b) => {\\n    let valA = key ? key(a) : a;\\n    let valB = key ? key(b) : b;\\n    \\n    if (typeof valA === \'string\' && typeof valB === \'string\') {\\n      return reverse ? valB.localeCompare(valA) : valA.localeCompare(valB);\\n    }\\n    \\n    return reverse ? valB - valA : valA - valB;\\n  });\\n}\\n```"}],"stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":25,"output_tokens":150}}'
  ],

  // Stream with tool use
  toolUseSession: [
    '{"id":"msg_01XQb5Q7GYFjDYmsk1RgFQBp","type":"message","role":"assistant","model":"claude-3-opus-20240229","content":[{"type":"text","text":"I\'ll search for the file pattern you mentioned."},{"type":"tool_use","id":"toolu_01A09q90qw90lq917835lq9","name":"str_replace_editor","input":{"command":"view","path":"src/"}}],"stop_reason":"tool_use","stop_sequence":null,"usage":{"input_tokens":30,"output_tokens":50}}',
    '{"id":"msg_01XQb5Q7GYFjDYmsk1RgFQBq","type":"tool_result","tool_use_id":"toolu_01A09q90qw90lq917835lq9","content":"src/\\n├── index.ts\\n├── utils.ts\\n└── config.ts"}',
    '{"id":"msg_01XQb5Q7GYFjDYmsk1RgFQBr","type":"message","role":"assistant","model":"claude-3-opus-20240229","content":[{"type":"text","text":"I found the source directory structure. Let me examine the index.ts file."}],"stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":80,"output_tokens":20}}'
  ],

  // Malformed JSON mixed with valid
  malformedMixed: [
    '{"valid":true,"type":"message","content":"This is valid"}',
    'This is not JSON at all',
    '{"partial":true,', // Incomplete
    '"broken}": "json"', // Invalid structure
    '{"valid":true,"type":"message","content":"This is also valid"}'
  ],

  // Large response chunks
  largeResponse: [
    '{"id":"msg_large","type":"message","role":"assistant","content":[{"type":"text","text":"' + 'x'.repeat(10000) + '"}],"usage":{"input_tokens":100,"output_tokens":2000}}'
  ],

  // Error response
  errorResponse: [
    '{"id":"msg_error","type":"error","error":{"type":"rate_limit_error","message":"Rate limit exceeded. Please wait before trying again."}}'
  ],

  // Streaming response (partial chunks)
  streamingChunks: [
    '{"id":"msg_',
    '01XQb5Q7GYF',
    'jDYmsk1RgFQ',
    'Bs","type":',
    '"message","',
    'role":"assi',
    'stant","con',
    'tent":[{"ty',
    'pe":"text",',
    '"text":"Hel',
    'lo, world!"',
    '}],"stop_re',
    'ason":"end_',
    'turn","usag',
    'e":{"input_',
    'tokens":5,"',
    'output_toke',
    'ns":3}}'
  ],

  // Mixed content types
  mixedContent: [
    'Starting claude-code...',
    '{"id":"msg_01","type":"message","content":[{"type":"text","text":"Processing..."}]}',
    'Debug: Connecting to API',
    '{"id":"msg_02","type":"message","content":[{"type":"text","text":"Connected"}]}',
    'Info: Request completed'
  ],

  // Unicode and special characters
  unicodeContent: [
    '{"id":"msg_unicode","type":"message","content":[{"type":"text","text":"Hello 世界! 🌍 Testing émojis and spëcial characters: \\n\\t• Item 1\\n\\t• Item 2"}]}'
  ],

  // Nested JSON structures
  nestedStructures: [
    '{"id":"msg_nested","type":"message","content":[{"type":"text","text":"Result: {\\"data\\": {\\"items\\": [1, 2, 3], \\"meta\\": {\\"count\\": 3}}}"}],"metadata":{"tags":["complex","nested"],"debug":{"timing":{"start":1234567890,"end":1234567900}}}}'
  ],

  // Rapid small messages
  rapidMessages: Array(100).fill(0).map((_, i) => 
    `{"id":"msg_${i}","type":"message","content":[{"type":"text","text":"Message ${i}"}],"usage":{"input_tokens":1,"output_tokens":2}}`
  ),

  // Empty and whitespace
  emptyContent: [
    '',
    '   ',
    '\n\n',
    '\t',
    '{"id":"msg_after_empty","type":"message","content":[{"type":"text","text":"After empty"}]}'
  ]
};

// Helper to create a readable stream from samples
export function createSampleStream(sampleName: keyof typeof streamSamples): NodeJS.ReadableStream {
  const { Readable } = require('stream');
  const samples = streamSamples[sampleName];
  
  let index = 0;
  return new Readable({
    read() {
      if (index < samples.length) {
        this.push(samples[index] + '\n');
        index++;
      } else {
        this.push(null);
      }
    }
  });
}

// Helper to create a slow stream that emits chunks with delays
export function createSlowStream(chunks: string[], delayMs: number = 100): NodeJS.ReadableStream {
  const { Readable } = require('stream');
  
  let index = 0;
  return new Readable({
    async read() {
      if (index < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        this.push(chunks[index]);
        index++;
      } else {
        this.push(null);
      }
    }
  });
}

// Helper to create an infinite stream for stress testing
export function createInfiniteStream(pattern: string = '{"id":"msg","type":"test"}\n'): NodeJS.ReadableStream {
  const { Readable } = require('stream');
  
  return new Readable({
    read() {
      this.push(pattern);
    }
  });
}