import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import type { LibraryFolder, LibraryTrack, PhoneMix, PhoneMixLibrary } from '../src/shared/serverProtocol'
import { linkFromShare } from '../src/shared/shareLink'
import { syncIcon, type PhoneTrack } from '../src/shared/syncQueue'
import {
  createServerMix,
  deleteServerMix,
  downloadToPhone,
  fetchLibrary,
  fetchMixes,
  pairWithServer,
  pullFromServer,
  randomServerTrack,
  saveServerMix
} from './src/engine'
import { refreshPhoneTracks, watchPhoneLibrary } from './src/libraryFiles'
import { pkNative } from './src/native'
import { readPhoneName } from './src/phoneName'
import { mergeRefreshedTracks } from '../src/shared/phoneLibrary'

type Tab = 'get' | 'phone' | 'server' | 'mix' | 'pair'

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

function parentFolder(path: string): string {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export default function App() {
  const [tab, setTab] = useState<Tab>('get')
  const [state, setState] = useState<SavedState>(EMPTY)
  const [url, setUrl] = useState('')
  const [code, setCode] = useState('')
  const [query, setQuery] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [results, setResults] = useState<LibraryTrack[]>([])
  const [folders, setFolders] = useState<LibraryFolder[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [pullingId, setPullingId] = useState('')
  const [searching, setSearching] = useState(false)
  const [mixes, setMixes] = useState<PhoneMixLibrary | null>(null)
  const [openMixId, setOpenMixId] = useState('')
  const [mixName, setMixName] = useState('')
  const [message, setMessage] = useState('Paste a link, or share one into PK-Tunez.')
  const [busy, setBusy] = useState(false)
  const stateRef = useRef(state)
  const lastShare = useRef('')
  const searchMode = useRef(false)

  const refreshing = useRef(false)
  const refreshAgain = useRef(false)

  const persist = useCallback(async (next: SavedState) => {
    stateRef.current = next
    setState(next)
    const native = pkNative()
    if (!native) return
    await native.writeText('library.json', JSON.stringify(next))
  }, [])

  const refreshLibrary = useCallback(async () => {
    if (!pkNative()?.relocateTracks) return
    if (refreshing.current) {
      refreshAgain.current = true
      return
    }
    refreshing.current = true
    try {
      do {
        refreshAgain.current = false
        const before = stateRef.current.tracks
        const refreshed = await refreshPhoneTracks(before)
        const latest = stateRef.current
        const tracks = mergeRefreshedTracks(before, refreshed, latest.tracks)
        const changed =
          tracks.length !== latest.tracks.length ||
          tracks.some(
            (track, index) =>
              track.trackId !== latest.tracks[index]?.trackId || track.filePath !== latest.tracks[index]?.filePath
          )
        if (changed) await persist({ ...stateRef.current, tracks })
      } while (refreshAgain.current)
    } finally {
      refreshing.current = false
    }
  }, [persist])

  const run = useCallback(
    async (target: string, current: SavedState) => {
      setBusy(true)
      setMessage('Downloading...')
      try {
        const added = await downloadToPhone(target, sessionOf(current))
        const tracks = [
          ...added,
          ...current.tracks.filter((track) => !added.some((item) => item.trackId === track.trackId))
        ]
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

  const loadPage = useCallback(
    async (options: { q: string; dir: string; cursor: number; append: boolean }) => {
      setSearching(true)
      setMessage(options.q ? 'Searching...' : 'Loading the home library...')
      try {
        const page = await fetchLibrary(sessionOf(stateRef.current), {
          q: options.q,
          dir: options.dir,
          cursor: options.cursor,
          limit: 20
        })
        setFolders(page.folders ?? [])
        setNextCursor(page.nextCursor)
        setResults((current) => (options.append ? [...current, ...page.tracks] : page.tracks))
        if (!options.q) setMessage('Home library')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Search failed.')
      } finally {
        setSearching(false)
      }
    },
    []
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
        await refreshLibrary()
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
      void refreshLibrary()
      void pkNative()?.consumeShare().then((raw) => take(raw))
    })
    const librarySub = watchPhoneLibrary(() => {
      void refreshLibrary()
    })
    return () => {
      linkSub.remove()
      appSub.remove()
      librarySub()
    }
  }, [refreshLibrary, run])

  useEffect(() => {
    if (tab !== 'server') return
    if (searchMode.current && !folderPath) return
    void loadPage({ q: '', dir: folderPath, cursor: 0, append: false })
  }, [tab, folderPath, loadPage])

  const refreshMixes = useCallback(async () => {
    const library = await fetchMixes(sessionOf(stateRef.current))
    setMixes(library)
    setOpenMixId((current) => current || library.activeMixId)
    return library
  }, [])

  useEffect(() => {
    if (tab !== 'mix') return
    void refreshMixes().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'Could not load mixes.')
    })
  }, [tab, refreshMixes])

  const onDownload = () => {
    void run(url, state)
  }

  const onPair = async () => {
    setBusy(true)
    try {
      const phoneName = await readPhoneName()
      const token = await pairWithServer(state.serverUrl, code.trim(), phoneName)
      await persist({ ...state, token })
      setMessage('This phone is paired.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pairing failed.')
    } finally {
      setBusy(false)
    }
  }

  const onSearch = () => {
    searchMode.current = true
    setFolderPath('')
    void loadPage({ q: query.trim(), dir: '', cursor: 0, append: false })
  }

  const onPull = async (track: LibraryTrack) => {
    setPullingId(track.trackId)
    setMessage(`Saving ${track.title}...`)
    try {
      const saved = await pullFromServer(track, sessionOf(state))
      const tracks = [saved, ...state.tracks.filter((item) => item.trackId !== saved.trackId)]
      await persist({ ...state, tracks })
      setMessage(`Saved ${saved.title} from the home server.`)
      setTab('phone')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the track.')
    } finally {
      setPullingId('')
    }
  }

  const onRandom = async () => {
    setSearching(true)
    setMessage('Choosing a song...')
    try {
      const track = await randomServerTrack(sessionOf(state))
      setSearching(false)
      await onPull(track)
    } catch (error) {
      setSearching(false)
      setMessage(error instanceof Error ? error.message : 'Could not choose a song.')
    }
  }

  const onDownloadFolder = (folder: LibraryFolder) => {
    Alert.alert(
      'Download folder',
      `Save all ${folder.trackCount} tracks in ${folder.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => {
            void (async () => {
              setBusy(true)
              try {
                const tracks: LibraryTrack[] = []
                let cursor = 0
                for (;;) {
                  const page = await fetchLibrary(sessionOf(stateRef.current), {
                    dir: folder.path,
                    deep: true,
                    cursor,
                    limit: 100
                  })
                  tracks.push(...page.tracks)
                  if (page.nextCursor === null) break
                  cursor = page.nextCursor
                }
                let savedCount = 0
                for (const track of tracks) {
                  savedCount += 1
                  setMessage(`Saving ${savedCount} of ${tracks.length}...`)
                  const saved = await pullFromServer(track, sessionOf(stateRef.current))
                  stateRef.current = {
                    ...stateRef.current,
                    tracks: [
                      saved,
                      ...stateRef.current.tracks.filter((item) => item.trackId !== saved.trackId)
                    ]
                  }
                }
                await persist(stateRef.current)
                setMessage(`Saved ${savedCount} tracks from ${folder.name}.`)
                setTab('phone')
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not save the folder.')
              } finally {
                setBusy(false)
              }
            })()
          }
        }
      ]
    )
  }

  const openMix = mixes?.mixes.find((mix) => mix.id === openMixId) ?? null

  const addToMix = async (trackId: string) => {
    if (!openMix) {
      setMessage('Open a mix first.')
      setTab('mix')
      return
    }
    if (openMix.tracks.some((track) => track.trackId === trackId)) {
      setMessage('That track is already in the mix.')
      return
    }
    try {
      const saved = await saveServerMix(
        sessionOf(state),
        openMix.id,
        [...openMix.tracks.map((track) => track.trackId), trackId]
      )
      setMixes((current) =>
        current
          ? { ...current, mixes: current.mixes.map((mix) => (mix.id === saved.id ? saved : mix)) }
          : current
      )
      setMessage(`Added to ${saved.name}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the mix.')
    }
  }

  const removeFromMix = async (mix: PhoneMix, trackId: string) => {
    const saved = await saveServerMix(
      sessionOf(state),
      mix.id,
      mix.tracks.filter((track) => track.trackId !== trackId).map((track) => track.trackId)
    )
    setMixes((current) =>
      current
        ? { ...current, mixes: current.mixes.map((item) => (item.id === saved.id ? saved : item)) }
        : current
    )
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>PK-Tunez</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.tabs}>
          {(['get', 'phone', 'server', 'mix', 'pair'] as Tab[]).map((item) => (
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
                <Pressable
                  style={styles.trackText}
                  onPress={() => {
                    void pkNative()
                      ?.openFile(item.filePath)
                      .catch((error: unknown) => {
                        setMessage(error instanceof Error ? error.message : 'Could not open the track.')
                      })
                  }}
                >
                  <View style={styles.row}>
                    <View style={[styles.dot, syncIcon(item.syncState) === 'green' ? styles.green : styles.grey]} />
                    <View style={styles.trackText}>
                      <Text style={styles.trackTitle}>{item.title}</Text>
                      <Text style={styles.label}>{item.artist}</Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable onPress={() => void addToMix(item.trackId)}>
                  <Text style={styles.link}>Add</Text>
                </Pressable>
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
            <Pressable style={styles.button} disabled={searching || busy} onPress={onSearch}>
              <Text style={styles.buttonText}>{searching ? 'Searching...' : 'Search'}</Text>
            </Pressable>
            <Pressable style={styles.button} disabled={searching || busy || !!pullingId} onPress={() => void onRandom()}>
              <Text style={styles.buttonText}>Download random song</Text>
            </Pressable>
            {folderPath ? (
              <Pressable onPress={() => setFolderPath(parentFolder(folderPath))}>
                <Text style={styles.link}>Back · {folderPath}</Text>
              </Pressable>
            ) : null}
            <FlatList
              data={results}
              keyExtractor={(item) => item.trackId}
              ListHeaderComponent={
                <View>
                  {folders.map((folder) => (
                    <View key={folder.path} style={styles.track}>
                      <Pressable
                        style={styles.trackText}
                        onPress={() => {
                          searchMode.current = false
                          setQuery('')
                          setFolderPath(folder.path)
                        }}
                      >
                        <Text style={styles.trackTitle}>{folder.name}</Text>
                        <Text style={styles.label}>{folder.trackCount} tracks</Text>
                      </Pressable>
                      <Pressable onPress={() => onDownloadFolder(folder)}>
                        <Text style={styles.link}>Download</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.track}>
                  <Pressable style={styles.trackText} onPress={() => void onPull(item)}>
                    <View style={styles.row}>
                      {pullingId === item.trackId ? <ActivityIndicator color="#e2b33c" /> : null}
                      <View style={styles.trackText}>
                        <Text style={styles.trackTitle}>{item.title}</Text>
                        <Text style={styles.label}>
                          {item.artist}
                          {item.folder ? ` · ${item.folder}` : ''}
                          {item.ts ? ` · ${new Date(item.ts).toLocaleString()}` : ''}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => void addToMix(item.trackId)}>
                    <Text style={styles.link}>Add</Text>
                  </Pressable>
                </View>
              )}
              ListFooterComponent={
                nextCursor !== null ? (
                  <Pressable
                    style={styles.button}
                    onPress={() =>
                      void loadPage({
                        q: query.trim(),
                        dir: folderPath,
                        cursor: nextCursor,
                        append: true
                      })
                    }
                  >
                    <Text style={styles.buttonText}>Load more</Text>
                  </Pressable>
                ) : undefined
              }
            />
          </View>
        ) : null}

        {tab === 'mix' ? (
          <View style={styles.block}>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.grow]}
                value={mixName}
                placeholder="New mix name"
                placeholderTextColor="#8d8d8d"
                onChangeText={setMixName}
              />
              <Pressable
                style={styles.button}
                onPress={() => {
                  void createServerMix(sessionOf(state), mixName || 'My Mix')
                    .then((library: PhoneMixLibrary) => {
                      setMixes(library)
                      setOpenMixId(library.activeMixId)
                      setMixName('')
                    })
                    .catch((error: unknown) => {
                      setMessage(error instanceof Error ? error.message : 'Could not create the mix.')
                    })
                }}
              >
                <Text style={styles.buttonText}>Create</Text>
              </Pressable>
            </View>
            <FlatList
              data={mixes?.mixes ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View>
                  <Pressable onPress={() => setOpenMixId(item.id)}>
                    <Text style={item.id === openMixId ? styles.trackTitle : styles.label}>{item.name}</Text>
                  </Pressable>
                  {item.id === openMixId
                    ? item.tracks.map((track) => (
                        <View key={track.trackId} style={styles.track}>
                          <Text style={styles.trackText}>
                            {track.title} · {track.artist}
                          </Text>
                          <Pressable onPress={() => void removeFromMix(item, track.trackId)}>
                            <Text style={styles.link}>Remove</Text>
                          </Pressable>
                        </View>
                      ))
                    : null}
                  {item.id === openMixId ? (
                    <Pressable
                      onPress={() => {
                        void deleteServerMix(sessionOf(state), item.id).then(setMixes)
                        setOpenMixId('')
                      }}
                    >
                      <Text style={styles.link}>Delete mix</Text>
                    </Pressable>
                  ) : null}
                </View>
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
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  tab: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#2c3644' },
  tabOn: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#3d6b4f' },
  tabText: { color: '#f4e7c5' },
  block: { flex: 1, gap: 10 },
  input: { backgroundColor: '#f4e7c5', color: '#1c2430', padding: 12, fontSize: 16 },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { color: '#b7c0ce' },
  link: { color: '#e2b33c', fontWeight: '700' },
  button: { backgroundColor: '#e2b33c', padding: 14, alignItems: 'center' },
  buttonText: { color: '#1c2430', fontWeight: '700' },
  track: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  trackText: { flex: 1, color: '#f4e7c5' },
  trackTitle: { color: '#f4e7c5', fontSize: 16 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  green: { backgroundColor: '#2e9e4f' },
  grey: { backgroundColor: '#9aa0a6' }
})
