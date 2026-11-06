import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ExtractError, extractResumeText } from './extract.ts';
import { MAX_RESUME_CHARS } from './schema.ts';

const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url));
const rejects = (file: Buffer, message: RegExp) =>
  assert.rejects(extractResumeText(file), (e: Error) => e instanceof ExtractError && message.test(e.message));

describe('extractResumeText', () => {
  it('reads a PDF', async () => {
    assert.match(await extractResumeText(fixture('resume.pdf')), /Ada Lovelace, software engineer/);
  });

  it('reads a DOCX', async () => {
    assert.match(await extractResumeText(fixture('resume.docx')), /Grace Hopper, compiler engineer/);
  });

  it('reads plain text, keeping non-English characters', async () => {
    assert.equal(await extractResumeText(Buffer.from('  山田太郎, engineer\n')), '山田太郎, engineer');
  });

  it('explains a PDF with no text in it, such as a scan', () => rejects(fixture('blank.pdf'), /No text found/));

  it('refuses a corrupt PDF', () => rejects(Buffer.from('%PDF-1.4 not really a pdf'), /could not be read/));

  it('refuses a zip that is not a Word document', () =>
    rejects(Buffer.from('PK\x03\x04 not really a zip', 'latin1'), /could not be read/));

  it('refuses other binary files, whatever they are named', () =>
    rejects(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]), /could not be read/));

  it('refuses text over the limit', () => rejects(Buffer.from('a'.repeat(MAX_RESUME_CHARS + 1)), /over 50,000/));

  it('treats an empty file as having no text', () => rejects(Buffer.alloc(0), /No text found/));
});
