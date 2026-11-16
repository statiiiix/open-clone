# Third-party licences

Open Clone itself is MIT licensed (see `LICENSE`). It is built on the following work.

## Models

Both are downloaded on first launch and are not bundled with the app.

- **VoxCPM2** by OpenBMB, Apache-2.0. The voice model. <https://huggingface.co/openbmb/VoxCPM2>
- **Whisper small.en** by OpenAI, MIT, in the CTranslate2 conversion published by Systran (MIT). Writes down the words in a
  voice sample. <https://huggingface.co/Systran/faster-whisper-small.en>

## Bundled in the app

| Package | Version | Licence |
|---|---|---|
| electron | 45.3.2 | MIT (bundles Chromium and Node.js under their own licences, listed in the app's `LICENSES.chromium.html`) |
| react, react-dom | 19.3.1 | MIT |
| adm-zip | 0.5.18 | MIT |
| boolean | 3.2.0 | MIT |
| define-data-property | 1.1.4 | MIT |
| define-properties | 1.2.1 | MIT |
| detect-node | 2.1.0 | MIT |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es6-error | 4.1.1 | MIT |
| escape-string-regexp | 4.0.0 | MIT |
| global-agent | 3.0.0 | BSD-3-Clause |
| globalthis | 1.0.4 | MIT |
| gopd | 1.2.0 | MIT |
| has-property-descriptors | 1.0.2 | MIT |
| json-stringify-safe | 5.0.1 | ISC |
| matcher | 3.0.0 | MIT |
| object-keys | 1.1.1 | MIT |
| roarr | 2.15.4 | BSD-3-Clause |
| semver | 7.8.6 | ISC |
| semver-compare | 1.0.0 | MIT |
| serialize-error | 7.0.1 | MIT |
| sprintf-js | 1.1.3 | BSD-3-Clause |
| type-fest | 0.13.1 | (MIT OR CC0-1.0) |

## Python runtime bundled in the app

The voice engine runs in a private copy of **Python 3.12** (PSF licence), from the
[python-build-standalone](https://github.com/astral-sh/python-build-standalone) project, with the packages below. Versions are
those of the Intel build; the Apple Silicon build uses PyTorch and torchaudio 2.5.1 and newer numba and llvmlite.

Two components are under the LGPL, which allows commercial distribution as long as they stay separate, replaceable libraries,
as they are here: **soxr** (LGPL-2.1-or-later), and the **FFmpeg** libraries inside the **av** package (LGPL builds, including
the LAME MP3 encoder used for MP3 export).

| Package | Version | Licence |
|---|---|---|
| addict | 2.4.0 | MIT License |
| annotated-doc | 0.0.6 | MIT |
| annotated-types | 0.8.0 | MIT |
| anyascii | 0.3.3 | ISC License (ISCL) |
| anyio | 4.16.0 | MIT |
| audioread | 3.1.0 | MIT |
| av | 19.0.2 | BSD-3-Clause |
| certifi | 2026.10.23 | Mozilla Public License 2.0 (MPL 2.0) |
| cffi | 2.1.1 | MIT-0 |
| charset-normalizer | 3.5.2 | MIT |
| click | 8.5.1 | BSD-3-Clause |
| cloudpickle | 3.1.2 | BSD License |
| coloredlogs | 15.0.1 | MIT License |
| contractions | 0.1.73 | MIT |
| ctranslate2 | 4.9.0 | MIT |
| decorator | 5.3.1 | BSD-2-Clause |
| einops | 0.8.2 | MIT License |
| faster-whisper | 1.2.1 | MIT License |
| filelock | 4.2.10 | MIT |
| flatbuffers | 25.12.19 | Apache Software License |
| fsspec | 2026.9.0 | BSD-3-Clause |
| h11 | 0.16.0 | MIT License |
| hf-xet | 1.8.0 | Apache-2.0 |
| httpcore2 | 2.16.0 | BSD-3-Clause |
| httpx2 | 2.16.0 | BSD-3-Clause |
| huggingface_hub | 2.4.0 | Apache Software License |
| humanfriendly | 10.0 | MIT License |
| idna | 3.20 | BSD-3-Clause |
| inflect | 7.6.0 | MIT |
| jaraco.functools | 4.6.0 | MIT |
| Jinja2 | 3.1.6 | BSD License |
| joblib | 1.6.0 | BSD-3-Clause |
| kaldifst | 1.9.0 | Apache-2.0 |
| lazy-loader | 0.6 | BSD-3-Clause |
| librosa | 0.11.0 | ISC License (ISCL) |
| llvmlite | 0.43.0 | BSD |
| markdown-it-py | 4.3.0 | MIT License |
| MarkupSafe | 3.0.4 | BSD-3-Clause |
| mdurl | 0.1.2 | MIT License |
| more-itertools | 11.2.1 | MIT |
| mpmath | 1.3.0 | BSD License |
| msgpack | 1.2.4 | Apache-2.0 |
| narwhals | 2.28.0 | MIT |
| networkx | 3.7 | BSD-3-Clause |
| numba | 0.60.0 | BSD License |
| numpy | 1.26.4 | BSD License |
| onnxruntime | 1.23.2 | MIT License |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| pip | 26.3 | MIT |
| platformdirs | 4.14.5 | MIT |
| pooch | 1.9.0 | BSD-3-Clause |
| protobuf | 7.36.2 | 3-Clause BSD License |
| pyahocorasick | 2.3.1 | BSD-3-Clause and Public-Domain |
| pycparser | 3.12 | BSD-3-Clause |
| pydantic | 2.14.3 | MIT |
| pydantic_core | 2.50.4 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| PyYAML | 6.0.3 | MIT License |
| regex | 2026.11.15 | Apache-2.0 AND CNRI-Python |
| requests | 2.34.2 | Apache Software License |
| rich | 15.0.0 | MIT License |
| safetensors | 0.8.0 | Apache Software License |
| scikit-learn | 1.9.1 | BSD-3-Clause |
| scipy | 1.17.1 | BSD License |
| shellingham | 1.5.4 | ISC License (ISCL) |
| simplejson | 4.3.0 | MIT OR AFL-2.1 |
| sortedcontainers | 2.4.0 | Apache Software License |
| soundfile | 0.14.0 | BSD License |
| soxr | 1.1.0 | LGPL-2.1-or-later |
| sympy | 1.14.0 | BSD License |
| textsearch | 0.0.24 | MIT |
| threadpoolctl | 3.8.0 | BSD-3-Clause |
| tokenizers | 0.23.3 | Apache Software License |
| torch | 2.2.2 | BSD License |
| torchaudio | 2.2.2 | BSD License |
| tqdm | 4.70.1 | MPL-2.0 AND MIT |
| transformers | 5.23.0 | Apache 2.0 License |
| truststore | 0.10.5 | MIT |
| typeguard | 4.6.0 | MIT |
| typer | 0.29.1 | MIT |
| typing-inspection | 0.4.5 | MIT |
| typing_extensions | 4.16.0 | PSF-2.0 |
| urllib3 | 2.8.0 | MIT |
| voxcpm | 2.0.3 | Apache-2.0 |
| wetext | 0.2.1 | Apache-2.0 |
