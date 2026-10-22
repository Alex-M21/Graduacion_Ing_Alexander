import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptCui, decryptCui, hashCui, normalizeRegistration, albumIsOpen, csvCell, photoType } from '../lib/security.ts';
const key = Buffer.alloc(32,7).toString('base64');
const registration = { fullName:'  Invitado   de Prueba  ', email:'INVITADO@example.test', cui:'1234 56789 0123', attendance:'yes', consent:true };
test('CUI is encrypted with a fresh IV, bound to its owner, and recoverable only with the key', async () => {
  const first = await encryptCui('1234567890123','guest-one',key);
  assert.notEqual(first, await encryptCui('1234567890123','guest-one',key));
  assert.ok(!first.includes('1234567890123'));
  assert.equal(await decryptCui(first,'guest-one',key),'1234567890123');
  await assert.rejects(decryptCui(first,'guest-two',key));
  await assert.rejects(decryptCui(first,'guest-one',Buffer.alloc(32,8).toString('base64')));
});
test('CUI duplicate detection uses a stable keyed digest', async () => {
  assert.equal(await hashCui('1234567890123',key),await hashCui('1234567890123',key));
  assert.notEqual(await hashCui('1234567890123',key),await hashCui('1234567890124',key));
});
test('registration normalizes input and rejects invalid or nonconsensual records', () => {
  assert.deepEqual(normalizeRegistration(registration), { fullName:'Invitado de Prueba',email:'invitado@example.test',cui:'1234567890123',attendance:'yes' });
  for (const replacement of [{fullName:'Ana'}, {email:'invalid'}, {cui:'123'}, {attendance:'maybe'}, {consent:false}]) assert.throws(() => normalizeRegistration({...registration,...replacement}));
});
test('album opens exactly at midnight Guatemala on October 28', () => {
  const opens = '2026-10-28T00:00:00-06:00';
  assert.equal(albumIsOpen(opens,Date.parse('2026-10-28T05:59:59.999Z')),false);
  assert.equal(albumIsOpen(opens,Date.parse('2026-10-28T06:00:00Z')),true);
});
test('CSV quotes and formula prefixes are escaped', () => {
  assert.equal(csvCell('A "name"'),'"A ""name"""');
  assert.equal(csvCell(' =1+1'),'"\' =1+1"');
});
test('photo signatures reject HTML and SVG uploads', () => {
  assert.equal(photoType(new TextEncoder().encode('<svg></svg>')),null);
  assert.equal(photoType(new Uint8Array([255,216,255,224])),'image/jpeg');
  assert.equal(photoType(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');
});
