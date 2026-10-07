// sysnet.js — información de red del servidor para la tarjeta "Sistema" del admin.
// Lee /proc/net/dev (Linux/Docker) para totales RX/TX y calcula la tasa (bytes/s)
// entre llamadas consecutivas. Además expone hostname e IP interna primaria.
// Todo defensivo: si algo no está disponible, devuelve null en ese campo.
const fs = require('fs');
const os = require('os');

let _last = null; // { t, rx, tx }

function readNetTotals() {
    try {
        const data = fs.readFileSync('/proc/net/dev', 'utf8');
        let rx = 0, tx = 0, seen = false;
        data.split('\n').forEach(line => {
            const m = line.match(/^\s*([^:]+):\s*(.*)$/);
            if (!m) return;
            const iface = m[1].trim();
            if (iface === 'lo') return;                 // ignorar loopback
            const cols = m[2].trim().split(/\s+/).map(Number);
            // /proc/net/dev: col[0]=rx bytes ... col[8]=tx bytes
            rx += cols[0] || 0;
            tx += cols[8] || 0;
            seen = true;
        });
        return seen ? { rx, tx } : null;
    } catch (e) { return null; }
}

function primaryIp() {
    try {
        const ifaces = os.networkInterfaces();
        for (const name of Object.keys(ifaces)) {
            for (const a of ifaces[name] || []) {
                if (a && a.family === 'IPv4' && !a.internal) return a.address;
            }
        }
    } catch (e) {}
    return null;
}

// getNetworkStats(now) — now (ms) inyectable para tests; por defecto Date.now().
function getNetworkStats(now) {
    const t = (typeof now === 'number') ? now : Date.now();
    const totals = readNetTotals();
    let rx_rate = null, tx_rate = null;
    if (totals && _last && t > _last.t) {
        const dt = (t - _last.t) / 1000;
        rx_rate = Math.max(0, Math.round((totals.rx - _last.rx) / dt));
        tx_rate = Math.max(0, Math.round((totals.tx - _last.tx) / dt));
    }
    if (totals) _last = { t, rx: totals.rx, tx: totals.tx };
    return {
        hostname:  os.hostname(),
        ip:        primaryIp(),
        rx_total:  totals ? totals.rx : null,
        tx_total:  totals ? totals.tx : null,
        rx_rate,   // bytes/s (null en la primera lectura)
        tx_rate,
    };
}

// Solo para tests: reset del acumulador entre casos.
function _resetForTest() { _last = null; }

module.exports = { getNetworkStats, readNetTotals, _resetForTest };
