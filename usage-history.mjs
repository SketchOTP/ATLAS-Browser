import fs from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from 'node:zlib';

const FORMAT_VERSION = 1;
const HOUR_MS = 60 * 60 * 1000;
const RESET_RAPID_WINDOW_MS = 5 * 60 * 1000;
const RESET_MIN_INCREASE = 8;

function clampPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

function primaryLimit(payload) {
  const rateLimits = payload?.rateLimits || payload;
  if (!rateLimits) return null;
  if (rateLimits.primary) return rateLimits;
  const buckets = rateLimits.rateLimitsByLimitId || payload?.rateLimitsByLimitId;
  return buckets?.codex || Object.values(buckets || {}).find((bucket) => bucket?.primary) || null;
}

export function remainingUsagePercent(usage) {
  const explicit = clampPercent(usage?.remainingPercent);
  if (explicit !== null) return explicit;
  const used = clampPercent(primaryLimit(usage?.payload || usage)?.primary?.usedPercent);
  return used === null ? null : 100 - used;
}

function twelveMonthsAgo(timestamp) {
  const cutoff = new Date(timestamp);
  cutoff.setMonth(cutoff.getMonth() - 12);
  return cutoff.getTime();
}

export class UsageHistory {
  constructor({ filePath, now = () => Date.now() } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.loaded = false;
    this.data = { v: FORMAT_VERSION, observations: [], lastObservation: null };
  }
  #load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.filePath) return;
    try {
      const decoded = JSON.parse(brotliDecompressSync(fs.readFileSync(this.filePath)).toString('utf8'));
      if (decoded?.v === FORMAT_VERSION && Array.isArray(decoded.observations)) this.data = decoded;
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`USAGE_HISTORY_READ_FAILED ${error.message}`);
    }
    this.#trim(this.now());
  }
  #trim(timestamp) {
    const cutoff = twelveMonthsAgo(timestamp);
    this.data.observations = this.data.observations.filter((entry) => Number(entry?.[0]) >= cutoff);
    if (this.data.lastObservation && Number(this.data.lastObservation[0]) < cutoff) this.data.lastObservation = null;
  }
  #save() {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      const compressed = brotliCompressSync(JSON.stringify(this.data), { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } });
      fs.writeFileSync(`${this.filePath}.tmp`, compressed, { mode: 0o600 });
      fs.renameSync(`${this.filePath}.tmp`, this.filePath);
    } catch (error) { console.error(`USAGE_HISTORY_WRITE_FAILED ${error.message}`); }
  }
  recordUsage(usage, timestamp = this.now()) {
    const remaining = remainingUsagePercent(usage);
    if (remaining === null) return { recorded: false, reason: 'unavailable' };
    return this.record(remaining, timestamp);
  }
  record(remainingValue, timestamp = this.now()) {
    this.#load();
    const remaining = clampPercent(remainingValue);
    if (remaining === null) return { recorded: false, reason: 'invalid' };
    const previous = this.data.lastObservation;
    const previousRemaining = previous ? previous[1] / 10 : null;
    const rapidIncrease = previous && timestamp >= previous[0] && timestamp - previous[0] <= RESET_RAPID_WINDOW_MS && remaining - previousRemaining >= RESET_MIN_INCREASE;
    const hour = Math.floor(timestamp / HOUR_MS) * HOUR_MS;
    const tenths = Math.round(remaining * 10);
    let entry = this.data.observations.at(-1);
    let changed = false;
    if (!entry || entry[0] !== hour) { entry = [hour, tenths, tenths, tenths, []]; this.data.observations.push(entry); changed = true; }
    else { const low = Math.min(entry[1], tenths); const high = Math.max(entry[2], tenths); changed = low !== entry[1] || high !== entry[2] || tenths !== entry[3]; entry[1] = low; entry[2] = high; entry[3] = tenths; }
    if (rapidIncrease) { entry[4].push(timestamp); changed = true; }
    this.data.lastObservation = [timestamp, tenths];
    this.#trim(timestamp);
    if (changed) this.#save();
    return { recorded: true, remaining, resetDetected: Boolean(rapidIncrease) };
  }
  snapshot(timestamp = this.now()) {
    this.#load(); this.#trim(timestamp);
    return { retentionMonths: 12, sampledAt: timestamp, observations: this.data.observations.map(([hour, low, high, last, resets = []]) => ({ timestamp: hour, lowRemaining: low / 10, highRemaining: high / 10, remaining: last / 10, resets: resets.map(Number) })) };
  }
}
