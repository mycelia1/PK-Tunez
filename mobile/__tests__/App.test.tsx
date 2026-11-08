import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: object }) =>
      React.createElement(View, { style }, children),
  };
});

jest.mock('../src/engine', () => ({
  downloadToPhone: async () => [],
  pairWithServer: async () => 'token',
  pullFromServer: async () => {
    throw new Error('not used');
  },
  searchServer: async () => [],
}));

jest.mock('../src/native', () => ({
  pkNative: () => ({
    musicDir: async () => '/music',
    consumeShare: async () => null,
    readText: async () => '',
    writeText: async () => true,
    downloadToFile: async () => '/music/song.m4a',
    uploadFile: async () => ({ status: 200, body: '{"duplicate":false}' }),
  }),
}));

test('shows the phone library title', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain('PK-Tunez');
});
