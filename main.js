// main.js
'use strict';

const { app, BrowserWindow } = require('electron');
const { screen } = require('electron');   // ← 單獨取用，不要再解構 app

app.setAppUserModelId('com.hwaguo.colorfulslot'); // 與 build.appId 一致

let win = null;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    show: false,
    width: workArea.width,
    height: workArea.height,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#111218',
    title: '華谷電機三格照片拉霸機',
    frame: true,               // 有標題列與(最小/最大/關閉)
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('index.html');

  win.once('ready-to-show', () => {
    win.maximize();  // 啟動就占滿螢幕(保留標題列)
    win.show();
    win.focus();
  });

  // F11 切換真正全螢幕
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
