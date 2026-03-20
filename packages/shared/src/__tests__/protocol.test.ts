import { describe, expect, it } from 'vitest'
import { isRPCEvent, isRPCRequest, isRPCResponse } from '../protocol'

describe('RPC Protocol type guards', () => {
  describe('isRPCRequest', () => {
    it('should identify a valid RPC request with id and method', () => {
      const msg = { id: 1, method: 'forwardCDPCommand', params: { sessionId: 's1' } }
      expect(isRPCRequest(msg)).toBe(true)
    })

    it('should reject a message without method (response)', () => {
      const msg = { id: 1, result: { success: true } }
      expect(isRPCRequest(msg)).toBe(false)
    })

    it('should reject null and non-objects', () => {
      expect(isRPCRequest(null)).toBe(false)
      expect(isRPCRequest('string')).toBe(false)
      expect(isRPCRequest(42)).toBe(false)
    })
  })

  describe('isRPCResponse', () => {
    it('should identify a success response with id and result', () => {
      const msg = { id: 1, result: { targetId: 't1' } }
      expect(isRPCResponse(msg)).toBe(true)
    })

    it('should identify an error response with id and error', () => {
      const msg = { id: 1, error: 'No tab found' }
      expect(isRPCResponse(msg)).toBe(true)
    })

    it('should reject a message with method (request)', () => {
      const msg = { id: 1, method: 'ping' }
      expect(isRPCResponse(msg)).toBe(false)
    })
  })

  describe('isRPCEvent', () => {
    it('should identify an event with method but no id', () => {
      const msg = { method: 'forwardCDPEvent', params: { cdpMethod: 'Page.loadEventFired' } }
      expect(isRPCEvent(msg)).toBe(true)
    })

    it('should reject a message with id (request)', () => {
      const msg = { id: 1, method: 'ping' }
      expect(isRPCEvent(msg)).toBe(false)
    })
  })
})
