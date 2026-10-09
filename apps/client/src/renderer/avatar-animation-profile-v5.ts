import type { AvatarAction, AvatarPart } from './avatar-manifest';

// Original Habbux reader. Licensed animation data is a separate native asset.
export interface NativeAvatarAnimationProfile {
  readonly actions: Readonly<Record<AvatarAction, {readonly parts: Readonly<Partial<Record<AvatarPart, readonly {readonly number: number}[]>>>}>>;
  readonly sourceSha256: string;
}
const approvedSource = 'fb10beff5d0b4aef97301bf1dca9ed1c9ddb695ed13cd7ad1873f4caab8c45a4';
const parts = new Set(['bd','lg','sh','ch','lh','rh','ls','rs']);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseNativeAvatarAnimationProfile(input: unknown): NativeAvatarAnimationProfile {
  if (!record(input) || input.version !== 1 || !record(input.provenance) || input.provenance.status !== 'AUTHORIZED'
      || input.provenance.license !== 'GPL-3.0' || input.provenance.sha256 !== approvedSource || !record(input.actions)) throw new Error('Invalid native animation provenance');
  const actions = {} as Record<AvatarAction, {parts: Partial<Record<AvatarPart, readonly {number: number}[]>>}>;
  for (const action of ['std','wlk'] as const) {
    const data = input.actions[action];
    if (!record(data) || !record(data.parts) || Object.keys(data.parts).length !== 8) throw new Error('Invalid animation parts');
    const selected: Partial<Record<AvatarPart, readonly {number: number}[]>> = {};
    for (const [part, values] of Object.entries(data.parts)) {
      if (!parts.has(part) || !Array.isArray(values) || values.length !== (action === 'std' ? 1 : 4)) throw new Error('Invalid animation sequence');
      selected[part as AvatarPart] = Object.freeze(values.map((frame: unknown, index: number) => {
        if (!record(frame) || frame.number !== index || frame.assetAction !== action) throw new Error('Invalid animation frame');
        return Object.freeze({number: index});
      }));
    }
    actions[action] = Object.freeze({parts: Object.freeze(selected)});
  }
  return Object.freeze({actions: Object.freeze(actions), sourceSha256: approvedSource});
}

let profilePromise: Promise<NativeAvatarAnimationProfile> | undefined;
export function loadNativeAvatarAnimationProfile(): Promise<NativeAvatarAnimationProfile> {
  return profilePromise ??= (async () => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch('/client/assets/avatar/v5/animation-profile.json', {cache: 'no-cache', signal: controller.signal});
      if (!response.ok) throw new Error('Native animation profile unavailable');
      const text = await response.text();
      if (text.length > 16_384) throw new Error('Native animation profile exceeds limit');
      return parseNativeAvatarAnimationProfile(JSON.parse(text));
    } finally {clearTimeout(timeout);}
  })().catch(cause => {profilePromise = undefined; throw cause;});
}
