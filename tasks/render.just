# SPDX-License-Identifier: MIT

# List render recipes and their descriptions.
default:
    @just --list render

# Render a project to video: `just render video --workspace DIR --project ID`.
[working-directory('..')]
video *args:
    node render/render.mjs {{ args }}

# Grab one frame as an image: `just render frame --workspace DIR --project ID --at 2`.
[working-directory('..')]
frame *args:
    node render/frame.mjs {{ args }}

# Serve the HTTP render API on http://127.0.0.1:8787: `just render serve --workspace DIR`.
[working-directory('..')]
serve *args:
    node render/serve.mjs {{ args }}

# Probe what this machine's Chrome offers for WebGPU and codecs.
[working-directory('..')]
probe:
    node render/probe.mjs

# Run the contract tests that need no browser.
[working-directory('../render')]
test:
    npm test

# Run every portable headless suite against the built harness; needs `just web build` and ffmpeg.
[working-directory('../render')]
test-portable:
    npm run test:portable

# Build the render service's container image.
[working-directory('..')]
image tag="embeddablecut-render":
    docker build -f render/Dockerfile -t {{ tag }} .

# Run the container image on :8787 over a workspace folder.
image-run workspace tag="embeddablecut-render":
    docker run --rm -p 8787:8787 -v "$(realpath {{ workspace }})":/workspace {{ tag }}
