import { describe, expect, it } from 'vitest'
import { customerAddressUpdateSchema, deliveryInputSchema, deliveryLocationSchema } from '@sm/shared'

describe('address coordinate schemas', () => {
  it('accepts optional lat/lng on delivery input', () => {
    const parsed = deliveryInputSchema.parse({
      required: true,
      address: '北京市朝阳区',
      lat: 39.9042,
      lng: 116.4074,
    })
    expect(parsed.lat).toBeCloseTo(39.9042)
    expect(parsed.lng).toBeCloseTo(116.4074)
  })

  it('allows null coords', () => {
    const parsed = deliveryInputSchema.parse({
      required: false,
      address: null,
      lat: null,
      lng: null,
    })
    expect(parsed.lat).toBeNull()
    expect(parsed.lng).toBeNull()
  })

  it('rejects out-of-range latitude', () => {
    expect(() => deliveryLocationSchema.parse({ lat: 91, lng: 0 })).toThrow()
  })

  it('rejects unpaired coordinates', () => {
    expect(() =>
      deliveryInputSchema.parse({
        required: true,
        address: 'x',
        lat: 39.9,
      }),
    ).toThrow()
    expect(() =>
      customerAddressUpdateSchema.parse({
        lng: 116.4,
      }),
    ).toThrow()
  })

  it('rejects empty-string coordinates instead of coercing to 0', () => {
    expect(() =>
      deliveryInputSchema.parse({
        required: true,
        address: 'x',
        lat: '',
        lng: '',
      }),
    ).toThrow()
  })

  it('accepts address update with only coords', () => {
    const parsed = customerAddressUpdateSchema.parse({ lat: 31.23, lng: 121.47 })
    expect(parsed.address).toBeUndefined()
    expect(parsed.lat).toBeCloseTo(31.23)
  })
})
