import { JsonStreamParser } from '../../src/core/json-parser';

describe('JsonStreamParser', () => {
  let parser: JsonStreamParser;

  beforeEach(() => {
    parser = new JsonStreamParser();
  });

  describe('parse', () => {
    it('should parse complete JSON objects', () => {
      const input = '{"type":"query","content":"test"}';
      const result = parser.parse(input);
      
      expect(result).toEqual([
        { type: 'query', content: 'test' }
      ]);
    });

    it('should parse multiple JSON objects in one chunk', () => {
      const input = '{"id":1}\n{"id":2}\n{"id":3}';
      const result = parser.parse(input);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: 1 });
      expect(result[1]).toEqual({ id: 2 });
      expect(result[2]).toEqual({ id: 3 });
    });

    it('should handle partial JSON chunks', () => {
      const chunk1 = '{"type":"par';
      const chunk2 = 'tial","value":';
      const chunk3 = '123}';

      const result1 = parser.parse(chunk1);
      expect(result1).toEqual([]);

      const result2 = parser.parse(chunk2);
      expect(result2).toEqual([]);

      const result3 = parser.parse(chunk3);
      expect(result3).toEqual([
        { type: 'partial', value: 123 }
      ]);
    });

    it('should handle mixed valid and invalid JSON', () => {
      const input = '{"valid":true}\ninvalid json\n{"also":"valid"}';
      const result = parser.parse(input);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ valid: true });
      expect(result[1]).toEqual({ also: 'valid' });
    });

    it('should handle JSON with nested objects', () => {
      const input = '{"type":"response","data":{"model":"claude","tokens":100}}';
      const result = parser.parse(input);
      
      expect(result).toEqual([
        {
          type: 'response',
          data: {
            model: 'claude',
            tokens: 100
          }
        }
      ]);
    });

    it('should handle JSON arrays', () => {
      const input = '{"items":[1,2,3],"count":3}';
      const result = parser.parse(input);
      
      expect(result).toEqual([
        { items: [1, 2, 3], count: 3 }
      ]);
    });

    it('should handle escaped characters in JSON', () => {
      const input = '{"text":"Line 1\\nLine 2","quote":"\\"Hello\\""}';
      const result = parser.parse(input);
      
      expect(result).toEqual([
        {
          text: 'Line 1\nLine 2',
          quote: '"Hello"'
        }
      ]);
    });

    it('should handle empty chunks', () => {
      const result = parser.parse('');
      expect(result).toEqual([]);
    });

    it('should handle whitespace-only chunks', () => {
      const result = parser.parse('   \n\t  ');
      expect(result).toEqual([]);
    });
  });

  describe('buffer management', () => {
    it('should accumulate incomplete JSON in buffer', () => {
      parser.parse('{"incomplete":');
      const buffer = parser.getBuffer();
      
      expect(buffer).toBe('{"incomplete":');
    });

    it('should clear buffer after successful parse', () => {
      parser.parse('{"test":');
      parser.parse('true}');
      
      const buffer = parser.getBuffer();
      expect(buffer).toBe('');
    });

    it('should handle buffer overflow gracefully', () => {
      // Create a very long incomplete JSON
      const longString = '{"data":"' + 'x'.repeat(100000);
      parser.parse(longString);
      
      // Should truncate or handle gracefully
      const buffer = parser.getBuffer();
      expect(buffer.length).toBeLessThanOrEqual(65536); // Max buffer size
    });

    it('should reset buffer and state', () => {
      parser.parse('{"incomplete":');
      parser.reset();
      
      const buffer = parser.getBuffer();
      expect(buffer).toBe('');
    });
  });

  describe('recovery strategies', () => {
    it('should recover from malformed JSON after newline', () => {
      const input = 'malformed json\n{"valid":true}';
      const result = parser.parse(input);
      
      expect(result).toEqual([{ valid: true }]);
    });

    it('should timeout incomplete JSON chunks', () => {
      jest.useFakeTimers();
      
      parser.parse('{"incomplete":');
      
      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(1000);
      
      const result = parser.parse('{"new":"object"}');
      expect(result).toEqual([{ new: 'object' }]);
      
      jest.useRealTimers();
    });

    it('should handle stream format with metadata', () => {
      const input = 'data: {"type":"event","id":1}\ndata: {"type":"event","id":2}\n';
      const result = parser.parse(input);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'event', id: 1 });
      expect(result[1]).toEqual({ type: 'event', id: 2 });
    });
  });

  describe('performance', () => {
    it('should handle large JSON objects efficiently', () => {
      const largeObject = {
        type: 'response',
        content: 'x'.repeat(10000),
        metadata: Array(100).fill({ key: 'value' })
      };
      
      const input = JSON.stringify(largeObject);
      const start = Date.now();
      const result = parser.parse(input);
      const duration = Date.now() - start;
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('response');
      expect(duration).toBeLessThan(100); // Should parse in < 100ms
    });

    it('should handle rapid small chunks efficiently', () => {
      const chunks = Array(1000).fill('{"id":1}');
      const start = Date.now();
      
      let totalResults = 0;
      for (const chunk of chunks) {
        const results = parser.parse(chunk);
        totalResults += results.length;
      }
      
      const duration = Date.now() - start;
      expect(totalResults).toBe(1000);
      expect(duration).toBeLessThan(100); // Should process in < 100ms
    });
  });
});