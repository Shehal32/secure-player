import { contextBridge, ipcRenderer } from 'electron';
import * as os from 'os';
import * as crypto from 'crypto';

// Generate native hardware fingerprint from CPU + Network MAC + Hostname
function getNativeMachineId(): string {
  try {
    const interfaces = os.networkInterfaces();
    let macAddress = '';
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (iface) {
        for (const net of iface) {
          if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
            macAddress = net.mac;
            break;
          }
        }
      }
      if (macAddress) break;
    }

    const raw = `${os.hostname()}|${os.platform()}|${os.arch()}|${os.cpus()[0]?.model || ''}|${macAddress}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  } catch {
    return crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 32);
  }
}

const hardwareFingerprint = getNativeMachineId();

contextBridge.exposeInMainWorld('fonixDesktopAPI', {
  isDesktop: true,
  isHardwareProtected: true,
  hardwareFingerprint,
  platform: process.platform,
  version: '1.0.0',
  onDeepLink: (callback: (url: string) => void) => {
    ipcRenderer.on('open-deep-link', (_event, url) => callback(url));
  },
});
