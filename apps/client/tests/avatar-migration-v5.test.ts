import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseNativeAvatarAnimationProfile} from '../src/renderer/avatar-animation-profile-v5.ts';
import {WALK_FRAME_COUNT,AvatarAnimationController} from '../src/renderer/avatar-animation.ts';
// Converter is ESM; import independently so runtime never depends on compiler.
const {convertAvatarAnimationSource}=await import('../../../tools/avatar-v5/convert.mjs');
const source=readFileSync(new URL('../../../tools/avatar-v5/gpl-source/HabboAvatarAnimations.ts',import.meta.url),'utf8');
const profile=JSON.parse(readFileSync('apps/client/public/assets/avatar/v5/animation-profile.json','utf8'));

test('subset convertido deriva da fonte GPL distribuída, gate hash/licença/autoridade impede UNKNOWN',()=>{
 assert.deepEqual(convertAvatarAnimationSource(source,profile.provenance),profile);
 assert.throws(()=>convertAvatarAnimationSource(source,{...profile.provenance,status:'UNKNOWN'}));
 assert.throws(()=>convertAvatarAnimationSource(source,{...profile.provenance,license:'UNKNOWN'}));
 assert.throws(()=>convertAvatarAnimationSource(source+' ',profile.provenance));
 assert.equal(createHash('sha256').update(source).digest('hex'),profile.provenance.sha256);
 assert.equal(Object.keys(profile.actions).length,2);
 assert.equal(parseNativeAvatarAnimationProfile(profile).sourceSha256,profile.provenance.sha256);
 assert.throws(()=>parseNativeAvatarAnimationProfile({...profile,provenance:{...profile.provenance,status:'UNKNOWN'}}));
});
test('fonte Move controla quatro frames sem afetar clock, continuidade ou fallback STAND',()=>{
 assert.equal(WALK_FRAME_COUNT,4);
 for(const frames of Object.values(profile.actions.wlk.parts) as {number:number}[][])assert.deepEqual(frames.map(f=>f.number),[0,1,2,3]);
 for(const frames of Object.values(profile.actions.std.parts) as {number:number}[][])assert.deepEqual(frames.map(f=>f.number),[0]);
 const clock=new AvatarAnimationController(82);clock.setMoving(true);clock.advance(82*7+17);
 assert.equal(clock.currentFrame,3);clock.setMoving(false);clock.setMoving(true);clock.advance(65);
 assert.equal(clock.currentFrame,0);assert.equal(clock.snapshot().elapsedMs,0);
});
