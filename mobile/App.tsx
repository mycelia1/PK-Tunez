import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppState,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import type { LibraryTrack } from '../src/shared/serverProtocol'
import { linkFromShare } from '../src/shared/shareLink'
import { syncIcon, type PhoneTrack } from '../src/shared/syncQueue'
import { downloadToPhone, pairWithServer, pullFromServer, searchServer } from './src/engine'
import { pkNative } from './src/native'

type Tab = 'get' | 'phone' | 'server' | 'pair'

interface SavedState {
  autoSync: boolean
  serverUrl: string
  token: string
  tracks: PhoneTrack[]
}

const EMPTY: SavedState = { autoSync: true, serverUrl: '', token: '', tracks: [] }

function sessionOf(state: SavedState) {
  return { serverUrl: state.serverUrl, token: state.token, autoSync: state.autoSync }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('get')
  const [state, setState] = useState<SavedState>(EMPTY)
  const [url, setUrl] = useState('')
  const [code, setCode] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LibraryTrack[]>([])
  const [message, setMessage] = useState('Paste a link, or share one into PK-Tunez.')
  const [busy, setBusy] = useState(false)
  const stateRef = useRef(state)
  const lastShare = useRef('')
  stateRef.current = state

  const persist = useCallback(async (next: SavedState) => {
    setState(next)
    const native = pkNative()
    if (!native) return
    await native.writeText('library.json', JSON.stringify(next))
  }, [])

  const run = useCallback(
    async (target: string, current: SavedState) => {
      setBusy(true)
      setMessage('Downloading...')
      try {
        const added = await downloadToPhone(target, sessionOf(current))
        const tracks = [...added, ...current.tracks.filter((track) => !added.some((item) => item.trackId === track.trackId))]
        await persist({ ...current, tracks })
        const green = added.filter((track) => track.syncState === 'synced').length
        setMessage(`Saved ${added.length} track(s). ${green} synced to the home server.`)
        setTab('phone')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Download failed.')
      } finally {
        setBusy(false)
      }
    },
    [persist]
  )

  useEffect(() => {
    const take = async (raw: string | null | undefined) => {
      const link = linkFromShare(raw)
      if (!link || link === lastShare.current) return
      lastShare.current = link
      setUrl(link)
      await run(link, stateRef.current)
    }
    const boot = async () => {
      const native = pkNative()
      if (native) {
        const raw = await native.readText('library.json')
        if (raw) {
          try {
            const saved = { ...EMPTY, ...(JSON.parse(raw) as SavedState) }
            stateRef.current = saved
            setState(saved)
          } catch {
            // Keep the empty library when the file is damaged.
          }
        }
        await take(await native.consumeShare())
      }
      await take(await Linking.getInitialURL())
    }
    void boot()
    const linkSub = Linking.addEventListener('url', (event) => {
      void take(event.url)
    })
    const appSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      void pkNative()?.consumeShare().then((raw) => take(raw))
    })
    return () => {
      linkSub.remove()
      appSub.remove()
    }
  }, [run])

  const onDownload = () => {
    void run(url, state)
  }

  const onPair = async () => {
    setBusy(true)
    try {
      const token = await pairWithServer(state.serverUrl, code.trim(), 'Phone')
      await persist({ ...state, token })
      setMessage('This phone is paired.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pairing failed.')
    } finally {
      setBusy(false)
    }
  }

  const onSearch = async () => {
    setBusy(true)
    try {
      setResults(await searchServer(sessionOf(state), query))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Search failed.')
    } finally {
      setBusy(false)
    }
  }

  const onPull = async (track: LibraryTrack) => {
    setBusy(true)
    try {
      const saved = await pullFromServer(track, sessionOf(state))
      const tracks = [saved, ...state.tracks.filter((item) => item.trackId !== saved.trackId)]
      await persist({ ...state, tracks })
      setMessage(`Saved ${saved.title} from the home server.`)
      setTab('phone')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the track.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>PK-Tunez</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.tabs}>
        {(['get', 'phone', 'server', 'pair'] as Tab[]).map((item) => (
          <Pressable key={item} onPress={() => setTab(item)} style={tab === item ? styles.tabOn : styles.tab}>
            <Text style={styles.tabText}>{item}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'get' ? (
        <View style={styles.block}>
          <TextInput
            style={styles.input}
            value={url}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="YouTube or SoundCloud link"
            placeholderTextColor="#8d8d8d"
            onChangeText={setUrl}
          />
          <View style={styles.row}>
            <Text style={styles.label}>Auto-sync new downloads</Text>
            <Switch
              value={state.autoSync}
              onValueChange={(autoSync) => void persist({ ...state, autoSync })}
            />
          </View>
          <Pressable style={styles.button} disabled={busy} onPress={onDownload}>
            <Text style={styles.buttonText}>{busy ? 'Working...' : 'Download'}</Text>
          </Pressable>
        </View>
      ) : null}

      {tab === 'phone' ? (
        <FlatList
          data={state.tracks}
          keyExtractor={(item) => item.trackId}
          ListEmptyComponent={<Text style={styles.label}>No tracks on this phone yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.track}>
              <View style={[styles.dot, syncIcon(item.syncState) === 'green' ? styles.green : styles.grey]} />
              <View style={styles.trackText}>
                <Text style={styles.trackTitle}>{item.title}</Text>
                <Text style={styles.label}>{item.artist}</Text>
              </View>
            </View>
          )}
        />
      ) : null}

      {tab === 'server' ? (
        <View style={styles.block}>
          <TextInput
            style={styles.input}
            value={query}
            placeholder="Search the home server"
            placeholderTextColor="#8d8d8d"
            onChangeText={setQuery}
          />
          <Pressable style={styles.button} disabled={busy} onPress={() => void onSearch()}>
            <Text style={styles.buttonText}>Search</Text>
          </Pressable>
          <FlatList
            data={results}
            keyExtractor={(item) => item.trackId}
            renderItem={({ item }) => (
              <Pressable style={styles.track} onPress={() => void onPull(item)}>
                <View style={styles.trackText}>
                  <Text style={styles.trackTitle}>{item.title}</Text>
                  <Text style={styles.label}>{item.artist}</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      {tab === 'pair' ? (
        <View style={styles.block}>
          <Text style={styles.label}>Home server address from the PSI menu.</Text>
          <TextInput
            style={styles.input}
            value={state.serverUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://192.168.1.20:47321"
            placeholderTextColor="#8d8d8d"
            onChangeText={(serverUrl) => void persist({ ...state, serverUrl })}
          />
          <TextInput
            style={styles.input}
            value={code}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Pairing code"
            placeholderTextColor="#8d8d8d"
            onChangeText={setCode}
          />
          <Pressable style={styles.button} disabled={busy} onPress={() => void onPair()}>
            <Text style={styles.buttonText}>{state.token ? 'Paired. Pair again' : 'Pair'}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1c2430', padding: 16 },
  title: { color: '#f4e7c5', fontSize: 28, fontWeight: '700', marginBottom: 8 },
  message: { color: '#d7deea', marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#2c3644' },
  tabOn: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#3d6b4f' },
  tabText: { color: '#f4e7c5' },
  block: { flex: 1, gap: 10 },
  input: { backgroundColor: '#f4e7c5', color: '#1c2430', padding: 12, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: '#b7c0ce' },
  button: { backgroundColor: '#e2b33c', padding: 14, alignItems: 'center' },
  buttonText: { color: '#1c2430', fontWeight: '700' },
  track: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  trackText: { flex: 1 },
  trackTitle: { color: '#f4e7c5', fontSize: 16 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  green: { backgroundColor: '#2e9e4f' },
  grey: { backgroundColor: '#9aa0a6' }
})
