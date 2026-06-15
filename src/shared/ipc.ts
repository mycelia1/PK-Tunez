export const IPC = {
  START_DOWNLOAD: 'scdl:start-download',
  CANCEL_DOWNLOAD: 'scdl:cancel-download',
  GET_SETTINGS: 'scdl:get-settings',
  SAVE_SETTINGS: 'scdl:save-settings',
  GET_HISTORY: 'scdl:get-history',
  PICK_FOLDER: 'scdl:pick-folder',
  PICK_ARCHIVE_FILE: 'scdl:pick-archive-file',
  FILE_EXISTS: 'scdl:file-exists',
  OPEN_IN_DEFAULT_PLAYER: 'scdl:open-in-default-player',
  OPEN_FOLDER: 'scdl:open-folder',
  DOWNLOAD_ARCHIVE_FILE: 'scdl:download-archive-file',
  RESOLVE_AUDIO_PATH: 'scdl:resolve-audio-path',
  EVENT: 'scdl:event'
} as const
