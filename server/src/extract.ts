// Turns an untrusted upload into plain text, detecting its type from its contents, not its name.
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { MAX_RESUME_CHARS } from './schema.ts';

export class ExtractError extends Error {}

const startsWith = (file: Buffer, magic: string) => file.subarray(0, magic.length).toString('latin1') === magic;

async function toText(file: Buffer) {
  if (startsWith(file, '%PDF-')) return (await extractText(new Uint8Array(file), { mergePages: true })).text;
  if (startsWith(file, 'PK\x03\x04')) return (await mammoth.extractRawText({ buffer: file })).value;

  const text = new TextDecoder('utf-8', { fatal: true }).decode(file);
  if (text.includes('\0')) throw new Error('Binary file');
  return text;
}

// shortcut: no limit on decompressed size or parse time, use a limited worker before leaving loopback.
export async function extractResumeText(file: Buffer) {
  let text: string;
  try {
    text = (await toText(file)).trim();
  } catch {
    throw new ExtractError('That file could not be read. Upload a .txt, .pdf or .docx file.');
  }
  if (!text) throw new ExtractError('No text found in that file. A scanned document has none, so paste the text instead.');
  if (text.length > MAX_RESUME_CHARS) {
    throw new ExtractError(`That file is over ${MAX_RESUME_CHARS.toLocaleString('en-GB')} characters.`);
  }
  return text;
}
