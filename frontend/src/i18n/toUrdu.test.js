import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toUrdu } from './toUrdu.js';

test('common words come from the dictionary', () => {
  assert.equal(toUrdu('मैं ठीक हूँ'), 'میں ٹھیک ہوں');
  assert.equal(toUrdu('आज सिर में दर्द है'), 'آج سر میں درد ہے');
  assert.equal(toUrdu('बहुत थकान है'), 'بہت تھکان ہے');
});

test('letter mapping: long vowels kept, short vowels dropped, e at the end -> ے', () => {
  assert.equal(toUrdu('घर'), 'گھر');
  assert.equal(toUrdu('बेटा'), 'بیٹا');
  assert.equal(toUrdu('मुझे'), 'مجھے');
  assert.equal(toUrdu('ज़रूर'), 'زرور'); // Urdu spells it ضرور; the common z is used
  assert.equal(toUrdu('कहाँ'), 'کہاں');
});

test('mixed Urdu + English speech: Hindi script -> Urdu, English words stay English', () => {
  assert.equal(toUrdu('मेरा BP high है'), 'میرا BP high ہے');
  assert.equal(toUrdu('I am fine, शुक्रिया'), 'I am fine, شکریہ');
  assert.equal(toUrdu('डॉक्टर से बात की'), 'ڈاکٹر سے بات کی');
  assert.equal(toUrdu('हाँ जी, शुगर ठीक है'), 'ہاں جی, شوگر ٹھیک ہے');
});

test('Latin, Urdu and digits pass through; Hindi danda -> Urdu full stop', () => {
  assert.equal(toUrdu('Panadol 500 mg'), 'Panadol 500 mg');
  assert.equal(toUrdu('میں ٹھیک ہوں'), 'میں ٹھیک ہوں');
  assert.equal(toUrdu('ठीक है।'), 'ٹھیک ہے۔');
  assert.equal(toUrdu('१२'), '12');
  assert.equal(toUrdu(''), '');
});
