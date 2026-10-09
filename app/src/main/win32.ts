import koffi from 'koffi';

// Windows calls the app needs and Electron doesn't offer. Win32 BOOL is a
// 4-byte int, so it's declared as int, not bool.
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const GetClipboardSequenceNumber = user32.func('uint32_t __stdcall GetClipboardSequenceNumber()');
const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()');
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)');
const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)');
const QueryFullProcessImageNameW = kernel32.func('int __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, void *lpExeName, _Inout_ uint32_t *lpdwSize)');
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *hObject)');

/** Enough rights to read another program's file name, even one running as administrator. */
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
/** Room for the program's full path, in UTF-16 characters. */
const MAX_PATH_CHARS = 1024;

/** A number Windows raises every time the clipboard changes. Reading it never opens the clipboard. */
export function clipboardSequence(): number {
  return GetClipboardSequenceNumber() as number;
}

/** The file name of the program in front, e.g. "WowClassic.exe", or "" when Windows won't say. */
export function foregroundExeName(): string {
  const window = GetForegroundWindow();
  if (!window) return '';
  const processId = [0];
  GetWindowThreadProcessId(window, processId);
  if (!processId[0]) return '';
  const process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, processId[0]);
  if (!process) return '';
  try {
    const buffer = Buffer.alloc(MAX_PATH_CHARS * 2);
    const size = [MAX_PATH_CHARS];
    if (!QueryFullProcessImageNameW(process, 0, buffer, size)) return '';
    const fullPath = buffer.toString('utf16le', 0, size[0] * 2);
    return fullPath.slice(fullPath.lastIndexOf('\\') + 1);
  } finally {
    CloseHandle(process);
  }
}
