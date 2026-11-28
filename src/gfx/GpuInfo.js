// Which graphics adapter is the WebGL context actually running on? The browser picks it (powerPreference
// 'high-performance' is only a hint), so the game reads it back and tells the player when the frame is not on a real GPU.
let cached = null;
export function gpuInfo(renderer, fresh = false) {
  if (cached && !fresh) return cached;
  let name = '', vendor = '';
  try {
    const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
    vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)) || '';
  } catch { /* context lost or extension blocked */ }
  const s = (name + ' ' + vendor).toLowerCase();
  let kind = 'unknown';
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|warp/.test(s)) kind = 'software';
  else if (/nvidia|geforce|quadro|rtx|gtx|radeon (rx|pro)|rx \d{3,4}|arc\(tm\) a|intel\(r\) arc/.test(s)) kind = 'discrete';
  else if (/intel|uhd|iris|hd graphics|vega \d|radeon\(tm\) graphics|radeon graphics|apple|mali|adreno/.test(s)) kind = 'integrated';
  // tidy ANGLE's "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER (0x000021C4) Direct3D11 vs_5_0 ps_5_0, D3D11)"
  const m = /^ANGLE \(([^,]*),\s*(.*?)(\s*\(0x[0-9a-f]+\))?\s*(Direct3D|OpenGL|Vulkan|Metal|,)/i.exec(name);
  const label = kind === 'software' ? 'Software renderer (CPU) — ' + (/swiftshader/i.test(name) ? 'SwiftShader' : name || 'unknown') : ((m && m[2].trim()) || name).trim() || 'Unknown (hidden by the browser)';
  const api = /D3D11|Direct3D11/i.test(name) ? 'Direct3D 11' : /Vulkan/i.test(name) ? 'Vulkan' : /Metal/i.test(name) ? 'Metal' : /OpenGL/i.test(name) ? 'OpenGL' : 'WebGL 2';
  const tier = kind === 'software' || kind === 'integrated' ? 'low'
    : /gtx 16\d\d|gtx 10[567]\d|gtx 9[678]0|rtx 2050|rtx 3050|rx [45]\d0|rx [56][456]00|arc\(tm\) a[35]/i.test(s) ? 'mid'
    : kind === 'discrete' ? 'high' : 'mid';
  cached = { name, vendor, label, api, kind, tier };
  return cached;
}
export function gpuAdvice(info) {
  if (info.kind === 'software') return 'The game is being drawn by the CPU (software rendering) — the graphics card is not in use. Turn on hardware acceleration in the browser settings, update the graphics driver, or use the desktop .exe.';
  if (info.kind === 'integrated') return 'The game is running on the integrated graphics. On a PC with a dedicated card: Windows Settings › System › Display › Graphics › add the browser / COLOMBO.exe › High performance (the .exe asks Windows for this automatically), then restart the game.';
  if (info.tier === 'mid') return 'Mid-range discrete GPU detected — High preset + SGSR 85% Balanced is tuned for 60+ FPS with full dynamic lighting, shadows and water reflections.';
  if (info.kind === 'discrete') return 'Rendering runs on the dedicated graphics card. The CPU only prepares the frame (game logic, crowd, physics and draw submission).';
  return 'The browser hides the adapter name; if the frame rate is very low, check that hardware acceleration is on.';
}
