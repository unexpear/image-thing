const KEY = 'studio-ai-model-v1';

export function readModelChoice(slot) {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}')[slot] || ''; } catch { return ''; }
}
export function writeModelChoice(slot, name) {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  saved[slot] = name;
  localStorage.setItem(KEY, JSON.stringify(saved));
}

/** Notes for this laptop: RTX 3070 Ti, 8 GB, about 32 GB RAM. Higher quants are listed so a larger GPU can be selected. */
export function modelFitNote(slot, name) {
  const file = String(name || '').toLowerCase();
  if (!file) return 'No installed model was found for this task.';
  if (slot === 'image') {
    if (file.includes('q2')) return 'Fits this 8 GB laptop. This is the softest Qwen Image Edit quant. A higher Qwen Edit GGUF is the upgrade when you have more VRAM or can offload into 32 GB of RAM.';
    if (file.includes('q3')) return 'Same Qwen Image Edit model, a bit sharper. On 8 GB, keep the picture small. It may use system RAM.';
    if (file.includes('q4')) return 'Clearer Qwen Image Edit. Usually wants more than 8 GB unless the text encoder stays in system RAM.';
    if (/q5|q6|q8|fp8|bf16|fp16/.test(file)) return 'Higher quality, for a larger GPU. This 8 GB laptop is verified only on Q2_K.';
    return 'Installed file. This laptop is verified with qwen-image-edit-2511-Q2_K.gguf.';
  }
  if (slot === 'video') {
    if (file.includes('1.3b') || file.includes('1_3b')) return 'Fits this 8 GB laptop. A 14B Wan model is for a larger GPU.';
    if (file.includes('14b')) return 'Much heavier than this laptop. Expect it to fail or crawl unless you have a larger GPU.';
    return 'Installed video model. This laptop is verified with Wan2.1 VACE 1.3B.';
  }
  if (file.includes('turbo') || file.includes('hunyuan')) return 'Fits this laptop for a single prop. A larger checkpoint is for a bigger GPU.';
  return 'Installed 3D checkpoint. This laptop is verified with Hunyuan3D-2 MV Turbo.';
}

export async function fillModelSelect(select, { request, lists, slot, fallback, note }) {
  const names = [];
  for (const item of lists) {
    try {
      const info = await request('/object_info/' + item.node);
      for (const name of info[item.node]?.input?.required?.[item.field]?.[0] || []) if (!names.includes(name)) names.push(name);
    } catch { /* That loader is absent. */ }
  }
  const saved = readModelChoice(slot);
  const chosen = names.includes(saved) ? saved : names.includes(fallback) ? fallback : names[0] || '';
  select.replaceChildren(...names.map(name => new Option(name === fallback ? name + ' · this laptop' : name, name)));
  if (chosen) select.value = chosen;
  const show = () => { writeModelChoice(slot, select.value); if (note) note.textContent = modelFitNote(slot, select.value); };
  select.onchange = show;
  show();
  return () => select.value || fallback;
}
