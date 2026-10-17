const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('dm', {
  vault: { get: call('vault:get'), reveal: call('vault:reveal'), addSeed: call('vault:addSeed') },
  campaigns: {
    list: call('campaigns:list'), create: call('campaigns:create'), open: call('campaigns:open'), browse: call('campaigns:browse'),
    forget: call('campaigns:forget'), rename: call('campaigns:rename'), reveal: call('campaigns:reveal'),
    exportFile: call('campaigns:exportFile'), importFile: call('campaigns:importFile'),
  },
  tokens: { exportFiles: call('tokens:exportFiles') },
  history: { list: call('history:list'), read: call('history:read'), snapshot: call('history:snapshot') },
  backup: { now: call('backup:now'), info: call('backup:info'), reveal: call('backup:reveal') },
  attach: { save: call('attach:save'), list: call('attach:list'), read: call('attach:read'), write: call('attach:write') },
  cloud: { load: call('cloud:load'), save: call('cloud:save') },
  notes: {
    list: call('notes:list'), readAll: call('notes:readAll'), read: call('notes:read'), write: call('notes:write'),
    exists: call('notes:exists'), delete: call('notes:delete'), rename: call('notes:rename'), mkdir: call('notes:mkdir'),
  },
  state: { load: call('state:load'), save: call('state:save') },
  media: { save: call('media:save'), list: call('media:list'), read: call('media:read'), write: call('media:write') },
  file: { savePng: call('file:savePng') },
  print: { html: call('print:html') },
  server: {
    info: call('server:info'), publish: call('server:publish'), openDisplay: call('server:openDisplay'), newCode: call('server:newCode'),
    onPlayers: (fn) => ipcRenderer.on('server:players', (_e, list) => fn(list)),
  },
  openExternal: call('shell:open'),
  web: { open5e: call('web:open5e') },
  update: { info: call('update:info'), check: call('update:check'), download: call('update:download'), install: call('update:install'),
    onStatus: (fn) => ipcRenderer.on('update:status', (_e, st) => fn(st)) },
  onPlayerAction: (fn) => ipcRenderer.on('player:action', (_e, a) => fn(a)),
});
