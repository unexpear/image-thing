# Video preset comparison

Single runs on this RTX 3070 Ti laptop. Same source, prompt, seed 24680, 384x384 and 17 frames (1.0625 seconds). Device memory is sampled once per second and includes other GPU use; it is not a model-only allocation peak. Cache state and thermal/system load differ between sequential runs.

| Preset | Seconds | Peak device memory (GiB) |
|---|---:|---:|
| edges4 | 20.98 | 7.31 |
| source4 | 12.05 | 5.31 |
| source20 | 84.68 | 5.53 |
| source20strong | 149.91 | 5.53 |

Visual findings: outline guidance changed the room and pillows more. Original-frame guidance retained the layout and texture better, but both 4- and 20-step results changed background colors and over-saturated the scene. Increasing guidance from 1.0 to 1.2 did not solve this. These observations are from a sofa clip, not evidence of face or identity preservation.

Keep the 4-step default for quick experiments. Treat 20 steps as a slower alternative, not an automatic quality upgrade. Outputs are in ComfyUI/output/Qwen-Studio/Bench; full execution records are in logs/video-benchmark.json.

## Gentle variation experiment

Initializing the sampler with the source frames, reducing denoise to 0.6 and CFG to 3, with 20 steps and source guidance 1, took **215.94 seconds**. It kept more of the brown room and sofa layout, but did not achieve the requested blue upholstery and altered colors/details. Exposed as an experimental option, not the default. Record: `logs/video-preserve-result.json`; output: `preserve20_00001_.mp4`. GPU memory was not separately sampled for this follow-up.
