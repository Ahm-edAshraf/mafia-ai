const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomCode(length = 6) {
  return randomString(CODE_CHARS, length);
}

export function randomToken(length = 32) {
  return randomString(TOKEN_CHARS, length);
}

export function shuffle<T>(items: T[]) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function randomString(chars: string, length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = "";
  for (const byte of bytes) {
    result += chars[byte % chars.length];
  }
  return result;
}
