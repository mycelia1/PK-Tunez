import { readPhoneName } from '../src/phoneName'

const mockNative = {
  deviceName: jest.fn<Promise<string>, []>()
}

jest.mock('../src/native', () => ({
  pkNative: () => mockNative
}))

beforeEach(() => {
  mockNative.deviceName.mockReset()
})

test('uses the device name from settings', async () => {
  mockNative.deviceName.mockResolvedValue('  Ness Phone  ')
  await expect(readPhoneName()).resolves.toBe('Ness Phone')
})

test('uses Phone when the settings read is blocked', async () => {
  mockNative.deviceName.mockRejectedValue(
    new Error('settings key: <bluetooth_name> is only readable to apps with targetSDKVersion lower than or equal to :31')
  )
  await expect(readPhoneName()).resolves.toBe('Phone')
})

test('uses Phone when the device name is blank', async () => {
  mockNative.deviceName.mockResolvedValue('   ')
  await expect(readPhoneName()).resolves.toBe('Phone')
})
