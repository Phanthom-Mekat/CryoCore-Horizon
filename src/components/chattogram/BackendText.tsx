/** Text the backend writes in English: the Bangla translation when we have one, else the original, marked as English. */
export function BackendText({ text, translated }: { text: string; translated?: string }) {
  return translated ?? <span lang="en">{text}</span>;
}
